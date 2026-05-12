import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPostingService } from '@/lib/posting';
import {
  syncPlatformRowsFromZernio,
  reconcileParentStatusFromSpp,
  isPastPendingGrace,
} from '@/lib/posting/zernio-reconcile';
import { notifyZernioWebhookRecipients } from '@/lib/social/zernio-webhook-notify';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';

export const maxDuration = 300;

const LOOKBACK_DAYS = 14;
const BATCH_LIMIT = 100;

type ParentRow = {
  id: string;
  late_post_id: string;
  status: string;
  scheduled_at: string | null;
  caption: string | null;
  client_id: string;
  clients: { name: string | null } | { name: string | null }[] | null;
};

/**
 * GET /api/cron/reconcile-zernio
 *
 * Daily reconciler that diffs DB against Zernio's truth for any post with a
 * `late_post_id` updated in the last 14 days. Catches state drift caused by
 * dropped webhooks, Zernio's stored record diverging from reality (the
 * Skibell FB class), or per-leg retry creating new Zernio posts that the
 * webhook trail can't tie back together.
 *
 * For each candidate:
 *   1. Snapshot current parent status
 *   2. Sync per-platform rows from Zernio
 *   3. Re-derive parent status from spp
 *   4. If parent transitioned into `failed` or `partially_failed` AND the
 *      original status was *not* already a fail state, fire the same
 *      `notifyZernioWebhookRecipients` email the webhook would have sent.
 *      This is the "make sure webhooks get sent if any posts fail" path:
 *      when Zernio drops or never fires the failed event, this catches it.
 *
 * Idempotent: subsequent runs see the post already in fail state and skip
 * the email.
 *
 * @auth Bearer CRON_SECRET (Vercel cron)
 */
async function handleGet(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data: candidates, error: queryErr } = await adminClient
      .from('scheduled_posts')
      .select('id, late_post_id, status, scheduled_at, caption, client_id, clients(name)')
      .not('late_post_id', 'is', null)
      .gte('updated_at', cutoff)
      .in('status', ['scheduled', 'publishing', 'partially_failed', 'failed', 'published'])
      .limit(BATCH_LIMIT);

    if (queryErr) {
      console.error('[reconcile-zernio] candidate query failed:', queryErr);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

    const rows = (candidates ?? []) as ParentRow[];
    let checked = 0;
    let drifted = 0;
    let notified = 0;
    const errors: { postId: string; error: string }[] = [];

    const service = getPostingService();

    for (const post of rows) {
      checked++;
      const beforeStatus = post.status;
      const isAlreadyTerminalFail = beforeStatus === 'failed' || beforeStatus === 'partially_failed';

      try {
        // Probe Zernio first to detect drift before any writes. If Zernio
        // 404s on the late_post_id (post genuinely vanished), we can't
        // reconcile — log + continue rather than letting the helper write
        // empty state.
        const zernio = await service.getPostStatus(post.late_post_id).catch(() => null);
        if (!zernio) continue;

        // Cheap drift detector: compare DB spp statuses vs. Zernio's. If
        // they match, skip the writes entirely (saves a few queries on the
        // happy path where most posts are already correct).
        const { data: existingSpp } = await adminClient
          .from('scheduled_post_platforms')
          .select('status, social_profile_id, social_profiles:social_profile_id (late_account_id)')
          .eq('post_id', post.id);

        type SppRow = {
          status: string;
          social_profile_id: string;
          social_profiles:
            | { late_account_id: string | null }
            | { late_account_id: string | null }[]
            | null;
        };
        const sppByLateId = new Map<string, string>();
        for (const row of (existingSpp ?? []) as SppRow[]) {
          const sp = row.social_profiles;
          const flat = Array.isArray(sp) ? sp : sp ? [sp] : [];
          for (const x of flat) {
            if (x.late_account_id) sppByLateId.set(x.late_account_id, row.status);
          }
        }

        let hasDrift = false;
        for (const platform of zernio.platforms) {
          const dbStatus = sppByLateId.get(platform.profileId);
          if (!dbStatus) continue;
          // Map Zernio's three-state to our local equivalents. Future-dated
          // legs come back as `scheduled` and must map to `pending` — never
          // to `failed` (the old `=== 'published' ? : 'failed'` collapse is
          // exactly what fired the May 6 false-positive alert).
          let zernioStatus: 'published' | 'failed' | 'pending';
          if (platform.status === 'published') zernioStatus = 'published';
          else if (platform.status === 'failed') zernioStatus = 'failed';
          else zernioStatus = 'pending';
          // DB pending + Zernio still pending = no drift IF we're still
          // inside the grace window after `scheduled_at`. Past grace, the
          // leg is stuck (e.g. expired YT token) — treat as drift so the
          // reconciler can flip the parent into `partially_failed`/`failed`
          // via the stale-pending rollup in `reconcileParentStatusFromSpp`.
          if (dbStatus === 'pending' && zernioStatus === 'pending') {
            if (isPastPendingGrace(post.scheduled_at)) {
              hasDrift = true;
              break;
            }
            continue;
          }
          if (dbStatus === 'pending') {
            hasDrift = true;
            break;
          }
          if (dbStatus === zernioStatus) continue;
          // Don't flag as drift if DB says published and Zernio says
          // failed — the helper guards against downgrading published, and
          // this is the Skibell FB pattern where Zernio's stored record is
          // stale. We trust the DB here.
          if (dbStatus === 'published' && zernioStatus === 'failed') continue;
          hasDrift = true;
          break;
        }

        if (!hasDrift) continue;
        drifted++;

        await syncPlatformRowsFromZernio(adminClient, post.late_post_id);
        await reconcileParentStatusFromSpp(adminClient, post.late_post_id);

        // Re-fetch parent + spp to decide whether to notify.
        const { data: refreshed } = await adminClient
          .from('scheduled_posts')
          .select('status')
          .eq('id', post.id)
          .maybeSingle();
        const afterStatus = (refreshed as { status?: string } | null)?.status ?? beforeStatus;
        const transitionedToFail =
          !isAlreadyTerminalFail &&
          (afterStatus === 'failed' || afterStatus === 'partially_failed');

        if (transitionedToFail) {
          notified++;
          const clientName =
            (Array.isArray(post.clients) ? post.clients[0]?.name : post.clients?.name) ??
            'Unknown client';
          const captionPreview = (post.caption ?? '').slice(0, 120);

          // Pull the failed-leg failure_reason for context.
          const { data: failedLegs } = await adminClient
            .from('scheduled_post_platforms')
            .select('failure_reason, social_profiles:social_profile_id (platform)')
            .eq('post_id', post.id)
            .eq('status', 'failed');

          type FailedLeg = {
            failure_reason: string | null;
            social_profiles: { platform: string | null } | { platform: string | null }[] | null;
          };
          const failDetail = ((failedLegs ?? []) as FailedLeg[])
            .map((leg) => {
              const sp = leg.social_profiles;
              const platform = (Array.isArray(sp) ? sp[0]?.platform : sp?.platform) ?? '';
              const reason = leg.failure_reason ?? 'unknown';
              return platform ? `${platform}: ${reason}` : reason;
            })
            .filter(Boolean)
            .join('; ');

          await notifyZernioWebhookRecipients({
            type: 'post_failed',
            title: `Scheduled post failed (drift detected), ${clientName}`,
            body: [
              captionPreview && `Caption: ${captionPreview}`,
              failDetail && `Detail: ${failDetail}`,
              'Surfaced by daily reconciler — Zernio webhook may have been dropped.',
            ]
              .filter(Boolean)
              .join('\n'),
            linkPath: '/admin/scheduler',
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[reconcile-zernio] failed for ${post.late_post_id}:`, msg);
        errors.push({ postId: post.late_post_id, error: msg });
      }
    }

    return NextResponse.json({
      message: `Reconciled ${checked} posts`,
      checked,
      drifted,
      notified,
      errors: errors.length,
    });
  } catch (error) {
    console.error('GET /api/cron/reconcile-zernio error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withCronTelemetry(
  {
    route: '/api/cron/reconcile-zernio',
    extractRowsProcessed: (body) => {
      if (body && typeof body === 'object' && 'checked' in body) {
        const v = (body as { checked?: unknown }).checked;
        if (typeof v === 'number') return v;
      }
      return undefined;
    },
  },
  handleGet,
);
