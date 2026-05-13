import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';
import { getPostingService } from '@/lib/posting';

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
 * Chat alerts: removed 2026-05-13. Both the "❌ Post rejected by
 * platform" and "⚠️ Post stuck in publishing" cards used to fire from
 * this cron; they've been absorbed into the post-health cron, which
 * scans the same conditions and emits a single consolidated failure
 * card with dedup. This cron now only maintains DB state:
 * `verification_status` + `failure_reason` per leg.
 *
 * Auth: Bearer `CRON_SECRET` (Vercel cron header).
 */

/** Max legs to claim per cron tick. With 4 core legs * ~200 active posts/day,
 *  the steady-state pending pool is bounded; 200 leaves headroom for spikes. */
const MAX_LEGS_PER_TICK = 200;

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
  } | null;
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
        id, client_id, caption, late_post_id
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

  await Promise.all(
    Array.from(byPost.entries()).map(async ([postId, postLegs]) => {
      const post = postLegs[0]?.scheduled_posts;
      const latePostId = post?.late_post_id ?? null;
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
          // Chat alert removed 2026-05-13. post-health reads
          // verification_status='platform_reject' + failure_reason to
          // emit a single consolidated card.
          void postId;
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

  return NextResponse.json({
    probed: legs.length,
    confirmed,
    rejected,
    ambiguous,
    unverifiable,
  });
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
      };
      return {
        confirmed: b.confirmed,
        rejected: b.rejected,
        ambiguous: b.ambiguous,
        unverifiable: b.unverifiable,
      };
    },
  },
  handleGet,
);
