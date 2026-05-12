import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';
import { getPostingService } from '@/lib/posting';
import {
  buildChatCardMessage,
  postToGoogleChatSafe,
} from '@/lib/chat/post-to-google-chat';
import { resolveTeamChatWebhook } from '@/lib/chat/resolve-team-webhook';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';
import type { AgencyBrand } from '@/lib/agency/detect';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/verify-published-posts
 *
 * Post-publish round-trip verifier (PUB-02). `scheduled_post_platforms.status =
 * 'published'` only means "Zernio's API said success." The platform itself
 * can still silently reject a post (IG content-type mismatch, TikTok
 * shadow-removal, YT processing failure). This cron re-asks Zernio for
 * each freshly-published leg AFTER the platform has had time to process,
 * compares Zernio's authoritative view to ours, and pages Jack on real
 * platform-side rejects.
 *
 * Window: legs whose `published_at` falls between (now - 24h) and (now - 30m).
 * - 30-minute floor: IG/YT indexing latency means a probe right after
 *   publish can return "pending" for a post that publishes fine. Waiting
 *   30 minutes cuts the false-reject rate dramatically.
 * - 24-hour ceiling: anything older is stale enough that we'd act
 *   manually. The cron stops re-probing and lets the row sit at whatever
 *   verification_status it has.
 *
 * Retry budget: a probe that comes back ambiguous (Zernio API error, leg
 * still 'pending' on Zernio's side) increments `verification_attempts`
 * and stays in `pending` for the next tick. After 6 attempts (~1h at the
 * every-10-minute schedule) we stamp `unverifiable`: no alert, but the
 * dashboard will surface the count as ambiguity to investigate. A
 * platform reject is terminal: we stamp once and never re-probe.
 *
 * Chat alert: one card per affected post (multiple rejected legs on the
 * same post are collapsed). Fires to the per-client webhook with the ops
 * fallback. The card has a "Retry on Cortex" button deep-linking to the
 * calendar so Jack can manually re-fire the failed leg.
 *
 * Auth: Bearer `CRON_SECRET` (Vercel cron header).
 */

/** Max legs to claim per cron tick. With 4 core legs * ~200 active posts/day,
 *  the steady-state pending pool is bounded; 200 leaves headroom for spikes. */
const MAX_LEGS_PER_TICK = 200;

/**
 * A row stuck in `publishing` past `scheduled_at + STUCK_PUBLISHING_AGE_MIN`
 * has had 7+ cron ticks to self-heal via the publish-posts CAS reclaim path
 * (cron runs every 2 min). If it hasn't, the failure is deterministic (bad
 * payload, Zernio outage). Page Jack once per stuck row.
 */
const STUCK_PUBLISHING_AGE_MIN = 15;

/** After this many ambiguous probes, mark `unverifiable` and stop probing. */
const MAX_VERIFICATION_ATTEMPTS = 6;

/** Minimum age before a published leg is eligible for verification. */
const MIN_AGE_MS = 30 * 60 * 1000;
/** Maximum age beyond which a leg ages out of the verify window. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface PendingLeg {
  id: string;
  post_id: string;
  social_profile_id: string;
  external_post_id: string | null;
  verification_attempts: number;
  social_profiles: {
    platform: string;
    username: string | null;
    late_account_id: string | null;
  } | null;
  scheduled_posts: {
    id: string;
    client_id: string | null;
    caption: string | null;
    late_post_id: string | null;
    clients: {
      id: string;
      name: string;
      agency: string | null;
      chat_webhook_url: string | null;
    } | null;
  } | null;
}

interface RejectAlert {
  postId: string;
  clientId: string;
  clientName: string;
  agency: string | null;
  chatWebhookUrl: string | null;
  caption: string | null;
  legs: Array<{
    platform: string;
    username: string | null;
    reason: string;
  }>;
}

async function handleGet(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = Date.now();
  const windowStartIso = new Date(now - MAX_AGE_MS).toISOString();
  const windowEndIso = new Date(now - MIN_AGE_MS).toISOString();

  // Claim a batch of pending-verification legs in the window. We don't do
  // a CAS-style "stamp as in-flight" claim because the cron is the only
  // writer to verification_status for pending->terminal transitions, and
  // Vercel guarantees only one of any duplicate cron tick wins (the
  // others 200 noop). A row touched twice in the same tick would just
  // get the same verification update, which is idempotent.
  const { data: legsRaw, error: claimErr } = await admin
    .from('scheduled_post_platforms')
    .select(
      `
      id,
      post_id,
      social_profile_id,
      external_post_id,
      verification_attempts,
      social_profiles!inner ( platform, username, late_account_id ),
      scheduled_posts!inner (
        id, client_id, caption, late_post_id,
        clients!inner ( id, name, agency, chat_webhook_url )
      )
    `,
    )
    .eq('status', 'published')
    .eq('verification_status', 'pending')
    .gte('published_at', windowStartIso)
    .lte('published_at', windowEndIso)
    .order('published_at', { ascending: true })
    .limit(MAX_LEGS_PER_TICK);

  if (claimErr) {
    return NextResponse.json(
      { error: 'db_error', detail: claimErr.message },
      { status: 500 },
    );
  }

  const legs = (legsRaw ?? []) as unknown as PendingLeg[];
  if (legs.length === 0) {
    return NextResponse.json({
      probed: 0,
      confirmed: 0,
      rejected: 0,
      ambiguous: 0,
      unverifiable: 0,
      alerted_posts: 0,
    });
  }

  // Group legs by parent post so we call Zernio's getPostStatus exactly
  // once per post instead of once per leg (the response covers all legs
  // in a single call).
  const byPost = new Map<string, PendingLeg[]>();
  for (const leg of legs) {
    const list = byPost.get(leg.post_id) ?? [];
    list.push(leg);
    byPost.set(leg.post_id, list);
  }

  const service = getPostingService();
  let confirmed = 0;
  let rejected = 0;
  let ambiguous = 0;
  let unverifiable = 0;
  const rejectAlerts = new Map<string, RejectAlert>();

  await Promise.all(
    Array.from(byPost.entries()).map(async ([postId, postLegs]) => {
      const post = postLegs[0]?.scheduled_posts;
      const latePostId = post?.late_post_id ?? null;
      const client = post?.clients ?? null;
      const nowIso = new Date().toISOString();

      // No Zernio handle -> can't verify. Treat as ambiguous attempt.
      if (!latePostId) {
        await markAmbiguousBatch(admin, postLegs, nowIso, 'no late_post_id on parent post');
        ambiguous += postLegs.length;
        return;
      }

      let zernio;
      try {
        zernio = await service.getPostStatus(latePostId);
      } catch (err) {
        // Zernio API error -> ambiguous, retry next tick.
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
          `[verify-published-posts] getPostStatus failed for ${postId}/${latePostId}: ${msg}`,
        );
        await markAmbiguousBatch(admin, postLegs, nowIso, `zernio probe error: ${msg.slice(0, 200)}`);
        ambiguous += postLegs.length;
        return;
      }

      // Per leg: match by late_account_id (Zernio's profileId) and decide.
      for (const leg of postLegs) {
        const lateAccountId = leg.social_profiles?.late_account_id ?? null;
        const zLeg = lateAccountId
          ? zernio.platforms.find((p) => p.profileId === lateAccountId)
          : undefined;

        if (!zLeg) {
          // Zernio doesn't know this leg. Either the platform has since
          // dropped it, or our late_account_id mapping is wrong. Increment
          // attempts and let the next tick re-probe; after the cap, stamp
          // unverifiable.
          const nextAttempts = (leg.verification_attempts ?? 0) + 1;
          if (nextAttempts >= MAX_VERIFICATION_ATTEMPTS) {
            await admin
              .from('scheduled_post_platforms')
              .update({
                verification_status: 'unverifiable',
                verification_attempts: nextAttempts,
                verification_detail: 'Zernio never returned this leg in /posts response.',
                last_verified_at: nowIso,
              })
              .eq('id', leg.id);
            unverifiable += 1;
          } else {
            await admin
              .from('scheduled_post_platforms')
              .update({
                verification_attempts: nextAttempts,
                verification_detail: 'Zernio /posts response missing this leg; retrying.',
                last_verified_at: nowIso,
              })
              .eq('id', leg.id);
            ambiguous += 1;
          }
          continue;
        }

        if (zLeg.status === 'published') {
          // Round-trip confirmed: Zernio's authoritative view agrees with ours.
          await admin
            .from('scheduled_post_platforms')
            .update({
              verification_status: 'confirmed',
              verification_attempts: (leg.verification_attempts ?? 0) + 1,
              verification_detail: null,
              last_verified_at: nowIso,
            })
            .eq('id', leg.id);
          confirmed += 1;
          continue;
        }

        if (zLeg.status === 'failed') {
          // Platform rejected the post after Zernio initially reported success.
          // Stamp terminal `platform_reject`, write the failure reason onto
          // the leg's `failure_reason` so the calendar UI surfaces it, and
          // queue a chat alert.
          const reason = zLeg.error ?? 'Platform rejected the post after publish.';
          await admin
            .from('scheduled_post_platforms')
            .update({
              verification_status: 'platform_reject',
              verification_attempts: (leg.verification_attempts ?? 0) + 1,
              verification_detail: reason,
              last_verified_at: nowIso,
              // Surface the same reason on the leg's existing failure_reason
              // column so existing dashboard/calendar code that reads it
              // doesn't have to know about the verify column. The leg's
              // top-level status stays 'published', the platform briefly
              // had it, and re-firing would create a duplicate if the
              // platform later un-rejects.
              failure_reason: reason,
            })
            .eq('id', leg.id);
          rejected += 1;

          if (client && post) {
            const existing = rejectAlerts.get(postId);
            if (existing) {
              existing.legs.push({
                platform: leg.social_profiles?.platform ?? 'unknown',
                username: leg.social_profiles?.username ?? null,
                reason,
              });
            } else {
              rejectAlerts.set(postId, {
                postId,
                clientId: client.id,
                clientName: client.name,
                agency: client.agency,
                chatWebhookUrl: client.chat_webhook_url,
                caption: post.caption,
                legs: [
                  {
                    platform: leg.social_profiles?.platform ?? 'unknown',
                    username: leg.social_profiles?.username ?? null,
                    reason,
                  },
                ],
              });
            }
          }
          continue;
        }

        // Zernio still has the leg in `scheduled` / `pending` / unknown state.
        // The platform hasn't confirmed yet on Zernio's side. Bump attempts
        // and retry next tick; cap at MAX_VERIFICATION_ATTEMPTS.
        const nextAttempts = (leg.verification_attempts ?? 0) + 1;
        if (nextAttempts >= MAX_VERIFICATION_ATTEMPTS) {
          await admin
            .from('scheduled_post_platforms')
            .update({
              verification_status: 'unverifiable',
              verification_attempts: nextAttempts,
              verification_detail: `Zernio leg stuck in '${zLeg.status ?? 'unknown'}' after ${nextAttempts} probes.`,
              last_verified_at: nowIso,
            })
            .eq('id', leg.id);
          unverifiable += 1;
        } else {
          await admin
            .from('scheduled_post_platforms')
            .update({
              verification_attempts: nextAttempts,
              verification_detail: `Zernio leg still '${zLeg.status ?? 'unknown'}'; retrying.`,
              last_verified_at: nowIso,
            })
            .eq('id', leg.id);
          ambiguous += 1;
        }
      }
    }),
  );

  // Fire alerts after the per-leg writes settle. One card per affected
  // post (legs collapsed). Fire-and-forget, chat failure must not block
  // the verify pass.
  let alertedPosts = 0;
  for (const alert of rejectAlerts.values()) {
    try {
      await sendPlatformRejectCard(admin, alert);
      alertedPosts += 1;
    } catch (err) {
      console.error(
        `[verify-published-posts] alert send failed for post ${alert.postId}:`,
        err,
      );
    }
  }

  const stuckAlerted = await scanAndAlertStuckPublishing(admin);

  return NextResponse.json({
    probed: legs.length,
    confirmed,
    rejected,
    ambiguous,
    unverifiable,
    alerted_posts: alertedPosts,
    stuck_publishing_alerted: stuckAlerted,
  });
}

/**
 * Stuck-publishing scan: a row in `status='publishing'` whose `scheduled_at`
 * is older than now() - 15min has missed multiple self-heal opportunities.
 * publish-posts' CAS reclaim ordinarily picks it back up within ~2min;
 * anything still 'publishing' after the grace window means a deterministic
 * issue (Zernio outage, malformed payload). Page Jack via Chat once per
 * incident; dedup via `stuck_publishing_alerted_at`. publish-posts clears
 * the stamp on the next successful publish so a fresh stuck event can
 * re-page.
 */
async function scanAndAlertStuckPublishing(
  admin: ReturnType<typeof createAdminClient>,
): Promise<number> {
  const cutoffIso = new Date(Date.now() - STUCK_PUBLISHING_AGE_MIN * 60 * 1000).toISOString();
  const { data: stuck, error } = await admin
    .from('scheduled_posts')
    .select(
      `id, caption, scheduled_at, late_post_id, retry_count,
       clients!inner ( id, name, agency, chat_webhook_url )`,
    )
    .eq('status', 'publishing')
    .lt('scheduled_at', cutoffIso)
    .is('stuck_publishing_alerted_at', null)
    .limit(50);

  if (error) {
    console.error('[verify-published-posts] stuck scan failed:', error.message);
    return 0;
  }

  type StuckRow = {
    id: string;
    caption: string | null;
    scheduled_at: string | null;
    late_post_id: string | null;
    retry_count: number | null;
    clients:
      | { id: string; name: string; agency: string | null; chat_webhook_url: string | null }
      | { id: string; name: string; agency: string | null; chat_webhook_url: string | null }[]
      | null;
  };
  const rows = (stuck ?? []) as unknown as StuckRow[];
  if (rows.length === 0) return 0;

  let alerted = 0;
  for (const row of rows) {
    const nowIso = new Date().toISOString();
    // Stamp first via conditional update; if another worker beat us, skip.
    const { data: stamped, error: stampErr } = await admin
      .from('scheduled_posts')
      .update({ stuck_publishing_alerted_at: nowIso })
      .eq('id', row.id)
      .is('stuck_publishing_alerted_at', null)
      .select('id')
      .maybeSingle();
    if (stampErr || !stamped) continue;

    try {
      await sendStuckPublishingCard(admin, row);
      alerted += 1;
    } catch (err) {
      console.error(
        `[verify-published-posts] stuck-publishing alert failed for ${row.id}:`,
        err,
      );
    }
  }

  return alerted;
}

async function sendStuckPublishingCard(
  admin: ReturnType<typeof createAdminClient>,
  row: {
    id: string;
    caption: string | null;
    scheduled_at: string | null;
    late_post_id: string | null;
    retry_count: number | null;
    clients:
      | { id: string; name: string; agency: string | null; chat_webhook_url: string | null }
      | { id: string; name: string; agency: string | null; chat_webhook_url: string | null }[]
      | null;
  },
): Promise<void> {
  const client = Array.isArray(row.clients) ? row.clients[0] : row.clients;
  if (!client) return;

  const webhook = await resolveTeamChatWebhook(admin, {
    primaryUrl: client.chat_webhook_url,
    agency: client.agency,
  });
  const finalWebhook = webhook ?? process.env.OPS_GOOGLE_CHAT_WEBHOOK ?? process.env.OPS_CHAT_WEBHOOK_URL ?? null;
  if (!finalWebhook) return;

  const baseUrl = getCortexAppUrl(((client.agency as AgencyBrand | null) ?? 'nativz') as AgencyBrand);
  const calendarUrl = `${baseUrl}/admin/calendar?postId=${encodeURIComponent(row.id)}`;
  const captionTrunc = row.caption
    ? row.caption.length > 140
      ? row.caption.slice(0, 140) + '…'
      : row.caption
    : '(no caption)';

  const stuckSince = row.scheduled_at
    ? `${Math.round((Date.now() - Date.parse(row.scheduled_at)) / 60000)} min`
    : 'unknown';

  const fallback = [
    `⚠️ Post stuck in publishing: ${client.name}`,
    captionTrunc,
    '',
    `Scheduled at: ${row.scheduled_at ?? 'unknown'} (${stuckSince} ago)`,
    `late_post_id: ${row.late_post_id ?? 'null'}`,
    `retry_count: ${row.retry_count ?? 0}`,
    '',
    `Open: ${calendarUrl}`,
  ].join('\n');

  postToGoogleChatSafe(
    finalWebhook,
    buildChatCardMessage({
      cardId: `stuck-publishing-${row.id}`,
      title: '⚠️ Post stuck in publishing',
      subtitle: client.name,
      paragraphs: [
        { html: `<b>Caption:</b> ${captionTrunc}` },
        {
          html: `<b>Stuck since:</b> ${row.scheduled_at ?? 'unknown'} (${stuckSince} ago)<br><b>late_post_id:</b> ${row.late_post_id ?? 'null'}<br><b>retry_count:</b> ${row.retry_count ?? 0}`,
        },
        {
          html:
            '<i>The publish-posts cron flipped this row to publishing but never landed terminal status. Self-heal via CAS reclaim should have run by now; manual investigation needed.</i>',
        },
      ],
      buttons: [{ text: 'Open in calendar', url: calendarUrl }],
      fallback,
    }),
    `verify-published-posts:stuck:${row.id}`,
  );
}

/**
 * Stamp every leg in the batch as an ambiguous attempt (bump counter,
 * note the detail, stamp last_verified_at). After the attempt cap, the
 * leg transitions to `unverifiable` instead.
 */
async function markAmbiguousBatch(
  admin: ReturnType<typeof createAdminClient>,
  legs: PendingLeg[],
  nowIso: string,
  detail: string,
): Promise<void> {
  await Promise.all(
    legs.map(async (leg) => {
      const nextAttempts = (leg.verification_attempts ?? 0) + 1;
      const isTerminal = nextAttempts >= MAX_VERIFICATION_ATTEMPTS;
      await admin
        .from('scheduled_post_platforms')
        .update({
          verification_status: isTerminal ? 'unverifiable' : 'pending',
          verification_attempts: nextAttempts,
          verification_detail: detail,
          last_verified_at: nowIso,
        })
        .eq('id', leg.id);
    }),
  );
}

/**
 * One chat card per post with platform-reject legs. The card has a
 * "Open in calendar" button deep-linked to the post so Jack can manually
 * re-fire the rejected leg. The leg's top-level status stays 'published'
 * because Zernio briefly accepted it, re-publishing via the cron's
 * retry path would orphan whatever Zernio's stored copy still thinks is
 * live. Manual action only.
 */
async function sendPlatformRejectCard(
  admin: ReturnType<typeof createAdminClient>,
  alert: RejectAlert,
): Promise<void> {
  const webhook = await resolveTeamChatWebhook(admin, {
    primaryUrl: alert.chatWebhookUrl,
    agency: alert.agency,
  });
  const finalWebhook = webhook ?? process.env.OPS_CHAT_WEBHOOK_URL ?? null;
  if (!finalWebhook) return;

  const baseUrl = getCortexAppUrl(((alert.agency as AgencyBrand | null) ?? 'nativz') as AgencyBrand);
  const calendarUrl = `${baseUrl}/admin/calendar?postId=${encodeURIComponent(alert.postId)}`;

  const captionTrunc = alert.caption
    ? alert.caption.length > 140
      ? alert.caption.slice(0, 140) + '…'
      : alert.caption
    : '(no caption)';

  const legLines = alert.legs
    .map((l) => {
      const handle = l.username ? ` (@${l.username})` : '';
      const reason = l.reason.length > 200 ? l.reason.slice(0, 200) + '…' : l.reason;
      return `• ${l.platform}${handle}: ${reason}`;
    })
    .join('\n');

  const fallback = [
    `❌ Post rejected by platform: ${alert.clientName}`,
    captionTrunc,
    '',
    legLines,
    '',
    `Open: ${calendarUrl}`,
  ].join('\n');

  postToGoogleChatSafe(
    finalWebhook,
    buildChatCardMessage({
      cardId: `verify-reject-${alert.postId}`,
      title: `❌ Post rejected by platform`,
      subtitle: alert.clientName,
      paragraphs: [
        { html: `<b>Caption:</b> ${captionTrunc}` },
        {
          html: `<b>Rejected legs:</b><br>${alert.legs
            .map((l) => {
              const handle = l.username ? ` (@${l.username})` : '';
              const reason = l.reason.length > 200 ? l.reason.slice(0, 200) + '…' : l.reason;
              return `• ${l.platform}${handle}: ${reason}`;
            })
            .join('<br>')}`,
        },
        {
          html:
            '<i>Zernio first reported success, then the platform rejected after publish. The leg status stays "published" on Cortex (re-firing risks a duplicate). Use the calendar to manually re-publish the rejected leg.</i>',
        },
      ],
      buttons: [{ text: 'Open in calendar', url: calendarUrl }],
      fallback,
    }),
    `verify-published-posts:${alert.postId}`,
  );
}

export const GET = withCronTelemetry(
  {
    route: '/api/cron/verify-published-posts',
    extractRowsProcessed: (body) => {
      if (typeof body !== 'object' || body === null) return undefined;
      const probed = (body as { probed?: number }).probed;
      return typeof probed === 'number' ? probed : undefined;
    },
    extractMetadata: (body) => {
      if (typeof body !== 'object' || body === null) return undefined;
      const b = body as {
        confirmed?: number;
        rejected?: number;
        ambiguous?: number;
        unverifiable?: number;
        alerted_posts?: number;
        stuck_publishing_alerted?: number;
      };
      return {
        confirmed: b.confirmed,
        rejected: b.rejected,
        ambiguous: b.ambiguous,
        unverifiable: b.unverifiable,
        alerted_posts: b.alerted_posts,
        stuck_publishing_alerted: b.stuck_publishing_alerted,
      };
    },
  },
  handleGet,
);
