import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';
import {
  buildChatCardMessage,
  postToGoogleChatSafe,
} from '@/lib/chat/post-to-google-chat';
import { createNotification } from '@/lib/notifications/create';
import { getPostingService } from '@/lib/posting';

export const maxDuration = 60;

const ALERT_EMAIL = 'jack@nativz.io';

/** Stuck-publishing threshold. A row stuck in `publishing` past this many
 *  minutes after its scheduled_at is treated as wedged (Vercel timeout,
 *  Zernio hang, deterministic payload bug). publish-posts self-heals via
 *  CAS, but a deterministic crash never recovers, so we page. */
const STUCK_PUBLISHING_AGE_MIN = 15;

/**
 * GET /api/cron/post-health
 *
 * Daily ops sweep, deduped via per-row "alerted_at" stamps so a single
 * incident only fires once. Rescheduled 2026-05-13 from every-30-min to
 * twice daily (12:45 PM CT + 2:00 PM CT) and absorbed two chat cards
 * that used to live in verify-published-posts.
 *
 * Four checks per run:
 *
 *   1. Failed posts — `scheduled_posts.status IN ('failed',
 *      'partially_failed')` with `health_alerted_at IS NULL`. Cleared
 *      automatically when the publish cron retries and flips status
 *      back to 'scheduled' or 'published' (those rows are filtered out
 *      by status, so re-failure with a new error will re-alert because
 *      the column gets reset on retry success).
 *
 *   2. Stuck publishing — `scheduled_posts.status = 'publishing'` and
 *      `scheduled_at < now() - 15min`, with
 *      `stuck_publishing_alerted_at IS NULL`. Catches the
 *      Vercel-timeout / Zernio-hang / deterministic-crash class where
 *      CAS-based self-heal isn't enough. publish-posts clears the
 *      column on next successful publish.
 *
 *   3. Platform rejects (leg-level) —
 *      `scheduled_post_platforms.verification_status = 'platform_reject'`
 *      with `health_alerted_at IS NULL`. Parent post status stays
 *      'published' because Zernio's API initially returned success;
 *      this is a per-leg silent reject the verify cron stamped. Dedup
 *      lives on scheduled_post_platforms.health_alerted_at, NOT the
 *      parent, since parent's column never fires for these.
 *
 *   4. Disconnected social profiles — compare Zernio's
 *      `getConnectedProfiles()` against local `social_profiles WHERE
 *      is_active = true`. Anything we think is active but Zernio says
 *      is gone (or returns isActive=false) is flagged once via
 *      `disconnect_alerted_at`, and we flip `is_active=false` so the
 *      profile stops being treated as live.
 *
 * Fan-out: single consolidated Google Chat card to `OPS_CHAT_WEBHOOK_URL`
 * with sections per failure type, plus an in-app notification to Jack.
 * Email send disabled 2026-05-06.
 *
 * @auth Bearer CRON_SECRET (Vercel cron)
 */
async function handleGet(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const nowMs = Date.now();
  const nowIso = new Date().toISOString();

  // ── 1. Failed posts ───────────────────────────────────────────────────────

  type FailedRow = {
    id: string;
    caption: string | null;
    scheduled_at: string | null;
    failure_reason: string | null;
    retry_count: number | null;
    status: 'failed' | 'partially_failed';
    client_id: string | null;
    clients: { name: string } | { name: string }[] | null;
  };

  const { data: failedRows, error: failedErr } = await admin
    .from('scheduled_posts')
    .select(`
      id,
      caption,
      scheduled_at,
      failure_reason,
      retry_count,
      status,
      client_id,
      clients ( name )
    `)
    .in('status', ['failed', 'partially_failed'])
    .is('health_alerted_at', null)
    .returns<FailedRow[]>();

  if (failedErr) {
    console.error('[post-health] failed-posts query error:', failedErr);
  }

  // Defensive gate: a row that's `failed` with retry_count=0, no failure
  // reason, AND a future scheduled_at can only have been stamped by a bug
  // upstream (the May 6 incident was the reconciler collapsing Zernio's
  // `scheduled` state into `failed`). Skip those, don't alert, but log.
  type FailedAlert = {
    postId: string;
    clientName: string;
    caption: string | null;
    scheduledFor: string | null;
    failureReason: string | null;
    retryCount: number;
    status: 'failed' | 'partially_failed';
  };
  const suspectIds: string[] = [];
  const failedPosts: FailedAlert[] = [];
  for (const r of failedRows ?? []) {
    const scheduledMs = r.scheduled_at ? new Date(r.scheduled_at).getTime() : null;
    const isUnattemptedFuture =
      (r.retry_count ?? 0) === 0 &&
      !r.failure_reason &&
      scheduledMs !== null &&
      scheduledMs > nowMs;
    if (isUnattemptedFuture) {
      suspectIds.push(r.id);
      continue;
    }
    const clientRow = Array.isArray(r.clients) ? r.clients[0] : r.clients;
    failedPosts.push({
      postId: r.id,
      clientName: clientRow?.name ?? '(unknown client)',
      caption: r.caption,
      scheduledFor: r.scheduled_at,
      failureReason: r.failure_reason,
      retryCount: r.retry_count ?? 0,
      status: r.status,
    });
  }
  if (suspectIds.length > 0) {
    console.warn(
      `[post-health] skipped ${suspectIds.length} suspect future-dated 'failed' rows (likely upstream stamp bug); not alerting. ids: ${suspectIds.slice(0, 20).join(',')}${suspectIds.length > 20 ? '…' : ''}`,
    );
  }

  // ── 2. Stuck publishing ───────────────────────────────────────────────────

  type StuckRow = {
    id: string;
    caption: string | null;
    scheduled_at: string | null;
    retry_count: number | null;
    client_id: string | null;
    clients: { name: string } | { name: string }[] | null;
  };

  const stuckCutoffIso = new Date(nowMs - STUCK_PUBLISHING_AGE_MIN * 60_000).toISOString();
  const { data: stuckRows, error: stuckErr } = await admin
    .from('scheduled_posts')
    .select(`
      id,
      caption,
      scheduled_at,
      retry_count,
      client_id,
      clients ( name )
    `)
    .eq('status', 'publishing')
    .lt('scheduled_at', stuckCutoffIso)
    .is('stuck_publishing_alerted_at', null)
    .returns<StuckRow[]>();

  if (stuckErr) {
    console.error('[post-health] stuck-publishing query error:', stuckErr);
  }

  type StuckAlert = {
    postId: string;
    clientName: string;
    caption: string | null;
    scheduledFor: string | null;
    ageMinutes: number;
    retryCount: number;
  };
  const stuckPosts: StuckAlert[] = (stuckRows ?? []).map((r) => {
    const clientRow = Array.isArray(r.clients) ? r.clients[0] : r.clients;
    const ageMs = r.scheduled_at ? nowMs - new Date(r.scheduled_at).getTime() : 0;
    return {
      postId: r.id,
      clientName: clientRow?.name ?? '(unknown client)',
      caption: r.caption,
      scheduledFor: r.scheduled_at,
      ageMinutes: Math.floor(ageMs / 60_000),
      retryCount: r.retry_count ?? 0,
    };
  });

  // ── 3. Platform rejects (leg-level) ───────────────────────────────────────

  type RejectRow = {
    id: string;
    post_id: string;
    verification_detail: string | null;
    failure_reason: string | null;
    last_verified_at: string | null;
    social_profiles: {
      platform: string;
      username: string | null;
    } | null;
    scheduled_posts: {
      id: string;
      caption: string | null;
      scheduled_at: string | null;
      clients: { name: string } | null;
    } | null;
  };

  const { data: rejectRows, error: rejectErr } = await admin
    .from('scheduled_post_platforms')
    .select(`
      id,
      post_id,
      verification_detail,
      failure_reason,
      last_verified_at,
      social_profiles!inner ( platform, username ),
      scheduled_posts!inner (
        id,
        caption,
        scheduled_at,
        clients!inner ( name )
      )
    `)
    .eq('verification_status', 'platform_reject')
    .is('health_alerted_at', null)
    .returns<RejectRow[]>();

  if (rejectErr) {
    console.error('[post-health] platform-reject query error:', rejectErr);
  }

  type RejectAlert = {
    legId: string;
    postId: string;
    clientName: string;
    platform: string;
    username: string | null;
    reason: string;
    scheduledFor: string | null;
  };
  const rejects: RejectAlert[] = (rejectRows ?? []).map((r) => ({
    legId: r.id,
    postId: r.post_id,
    clientName: r.scheduled_posts?.clients?.name ?? '(unknown client)',
    platform: r.social_profiles?.platform ?? 'unknown',
    username: r.social_profiles?.username ?? null,
    reason: r.verification_detail ?? r.failure_reason ?? 'Platform rejected the post after publish.',
    scheduledFor: r.scheduled_posts?.scheduled_at ?? null,
  }));

  // ── 4. Disconnected social profiles ───────────────────────────────────────

  type ProfileRow = {
    id: string;
    late_profile_id: string | null;
    platform: string;
    username: string | null;
    client_id: string;
    clients: { name: string } | null;
  };

  const { data: localProfiles, error: profileErr } = await admin
    .from('social_profiles')
    .select(`
      id,
      late_profile_id,
      platform,
      username,
      client_id,
      disconnect_alerted_at,
      clients!inner ( name )
    `)
    .eq('is_active', true)
    .is('disconnect_alerted_at', null)
    .returns<(ProfileRow & { disconnect_alerted_at: string | null })[]>();

  if (profileErr) {
    console.error('[post-health] profile query error:', profileErr);
  }

  type DisconnectAlert = {
    profileId: string;
    clientName: string;
    platform: string;
    username: string | null;
  };
  const disconnects: DisconnectAlert[] = [];
  const disconnectedProfileIds: string[] = [];

  if ((localProfiles ?? []).length > 0) {
    let zernioProfiles: Awaited<
      ReturnType<ReturnType<typeof getPostingService>['getConnectedProfiles']>
    > = [];
    try {
      const posting = getPostingService();
      zernioProfiles = await posting.getConnectedProfiles();
    } catch (err) {
      console.error('[post-health] Zernio getConnectedProfiles failed:', err);
    }

    const liveByLateId = new Map<string, boolean>();
    for (const z of zernioProfiles) {
      liveByLateId.set(z.id, z.isActive !== false);
    }

    for (const p of localProfiles ?? []) {
      const lateId = p.late_profile_id;
      if (!lateId) continue;
      const live = liveByLateId.get(lateId);
      if (live === true) continue;
      disconnects.push({
        profileId: p.id,
        clientName: p.clients?.name ?? '(unknown client)',
        platform: p.platform,
        username: p.username,
      });
      disconnectedProfileIds.push(p.id);
    }
  }

  // ── 5. Fan out one consolidated card per run ──────────────────────────────

  const hasAlerts =
    failedPosts.length > 0 ||
    stuckPosts.length > 0 ||
    rejects.length > 0 ||
    disconnects.length > 0;

  if (hasAlerts) {
    const summaryParts: string[] = [];
    if (failedPosts.length > 0) {
      summaryParts.push(
        `${failedPosts.length} failed post${failedPosts.length === 1 ? '' : 's'}`,
      );
    }
    if (stuckPosts.length > 0) {
      summaryParts.push(
        `${stuckPosts.length} stuck publishing`,
      );
    }
    if (rejects.length > 0) {
      summaryParts.push(
        `${rejects.length} platform reject${rejects.length === 1 ? '' : 's'}`,
      );
    }
    if (disconnects.length > 0) {
      summaryParts.push(
        `${disconnects.length} disconnected account${disconnects.length === 1 ? '' : 's'}`,
      );
    }
    const summary = summaryParts.join(' · ');

    // Build per-section lines. Each row gets enough detail to triage
    // without opening the calendar (failure type, retries, reason).
    const failedLines: string[] = [];
    if (failedPosts.length > 0) {
      for (const p of failedPosts.slice(0, 10)) {
        const label = p.status === 'partially_failed' ? 'Partial fail' : 'Failed';
        const reason = p.failureReason ? `, ${p.failureReason.slice(0, 140)}` : '';
        failedLines.push(
          `• ${p.clientName}, ${label} (retries: ${p.retryCount})${reason}`,
        );
      }
      if (failedPosts.length > 10) {
        failedLines.push(`…and ${failedPosts.length - 10} more.`);
      }
    }

    const stuckLines: string[] = [];
    if (stuckPosts.length > 0) {
      for (const p of stuckPosts.slice(0, 10)) {
        stuckLines.push(
          `• ${p.clientName}, stuck ${p.ageMinutes}min past scheduled_at (retries: ${p.retryCount})`,
        );
      }
      if (stuckPosts.length > 10) {
        stuckLines.push(`…and ${stuckPosts.length - 10} more.`);
      }
    }

    const rejectLines: string[] = [];
    if (rejects.length > 0) {
      for (const r of rejects.slice(0, 10)) {
        const handle = r.username ? ` @${r.username}` : '';
        rejectLines.push(
          `• ${r.clientName}, ${r.platform}${handle}, ${r.reason.slice(0, 140)}`,
        );
      }
      if (rejects.length > 10) {
        rejectLines.push(`…and ${rejects.length - 10} more.`);
      }
    }

    const disconnectLines: string[] = [];
    if (disconnects.length > 0) {
      for (const d of disconnects.slice(0, 10)) {
        disconnectLines.push(
          `• ${d.clientName}, ${d.platform}${d.username ? ` (@${d.username})` : ''}`,
        );
      }
      if (disconnects.length > 10) {
        disconnectLines.push(`…and ${disconnects.length - 10} more.`);
      }
    }

    const fallbackLines: string[] = [`*Cortex post-health alert*, ${summary}`];
    if (failedLines.length > 0) fallbackLines.push('', '*Failed posts:*', ...failedLines);
    if (stuckLines.length > 0) fallbackLines.push('', '*Stuck publishing:*', ...stuckLines);
    if (rejectLines.length > 0) fallbackLines.push('', '*Platform rejects:*', ...rejectLines);
    if (disconnectLines.length > 0) fallbackLines.push('', '*Disconnected accounts:*', ...disconnectLines);
    fallbackLines.push('', 'https://cortex.nativz.io/admin/calendar');

    const paragraphs: Array<string | { html: string } | null> = [];
    if (failedLines.length > 0) {
      paragraphs.push({
        html: `<b>Failed posts:</b><br>${failedLines.join('<br>')}`,
      });
    }
    if (stuckLines.length > 0) {
      paragraphs.push({
        html: `<b>Stuck publishing (>${STUCK_PUBLISHING_AGE_MIN}min):</b><br>${stuckLines.join('<br>')}`,
      });
    }
    if (rejectLines.length > 0) {
      paragraphs.push({
        html: `<b>Platform rejects:</b><br>${rejectLines.join('<br>')}`,
      });
    }
    if (disconnectLines.length > 0) {
      paragraphs.push({
        html: `<b>Disconnected accounts:</b><br>${disconnectLines.join('<br>')}`,
      });
    }

    postToGoogleChatSafe(
      process.env.OPS_CHAT_WEBHOOK_URL,
      buildChatCardMessage({
        cardId: 'post-health-alert',
        title: '🚨 Cortex post-health alert',
        subtitle: summary,
        paragraphs,
        buttons: [{ text: 'Open calendar', url: 'https://cortex.nativz.io/admin/calendar' }],
        fallback: fallbackLines.join('\n'),
      }),
      'post-health',
    );

    // In-app notification (lookup Jack's user id; super-admin always)
    const { data: jackRow } = await admin
      .from('users')
      .select('id')
      .ilike('email', ALERT_EMAIL)
      .maybeSingle();

    if (jackRow?.id) {
      await createNotification({
        recipientUserId: jackRow.id,
        type: 'post_health_alert',
        title: 'Posting health alert',
        body: summary,
        linkPath: '/admin/calendar',
      });
    }
  }

  // ── 6. Stamp dedup columns so we don't re-alert next run ──────────────────

  if (failedPosts.length > 0) {
    const ids = failedPosts.map((p) => p.postId);
    const { error: stampErr } = await admin
      .from('scheduled_posts')
      .update({ health_alerted_at: nowIso })
      .in('id', ids);
    if (stampErr) console.error('[post-health] failed-posts stamp error:', stampErr);
  }

  if (stuckPosts.length > 0) {
    const ids = stuckPosts.map((p) => p.postId);
    const { error: stampErr } = await admin
      .from('scheduled_posts')
      .update({ stuck_publishing_alerted_at: nowIso })
      .in('id', ids);
    if (stampErr) console.error('[post-health] stuck-publishing stamp error:', stampErr);
  }

  if (rejects.length > 0) {
    const ids = rejects.map((r) => r.legId);
    const { error: stampErr } = await admin
      .from('scheduled_post_platforms')
      .update({ health_alerted_at: nowIso })
      .in('id', ids);
    if (stampErr) console.error('[post-health] platform-reject stamp error:', stampErr);
  }

  if (disconnectedProfileIds.length > 0) {
    const { error: stampErr } = await admin
      .from('social_profiles')
      .update({ is_active: false, disconnect_alerted_at: nowIso })
      .in('id', disconnectedProfileIds);
    if (stampErr) console.error('[post-health] disconnect stamp error:', stampErr);
  }

  return NextResponse.json({
    failed_posts_alerted: failedPosts.length,
    stuck_publishing_alerted: stuckPosts.length,
    platform_rejects_alerted: rejects.length,
    disconnects_alerted: disconnects.length,
  });
}

export const GET = withCronTelemetry(
  {
    route: '/api/cron/post-health',
    extractRowsProcessed: (body) => {
      const b = body as {
        failed_posts_alerted?: number;
        stuck_publishing_alerted?: number;
        platform_rejects_alerted?: number;
        disconnects_alerted?: number;
      } | null;
      if (!b) return undefined;
      return (
        (b.failed_posts_alerted ?? 0) +
        (b.stuck_publishing_alerted ?? 0) +
        (b.platform_rejects_alerted ?? 0) +
        (b.disconnects_alerted ?? 0)
      );
    },
  },
  handleGet,
);
