import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPostingService } from '@/lib/posting';
import { ZernioPostingService } from '@/lib/posting/zernio';
import type { SocialPlatform } from '@/lib/posting/types';
import { preflightInstagramAspectForPost } from '@/lib/posting/validate-image-aspect';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';
import { notifyAdmins } from '@/lib/notifications';
import { publishScheduledPost } from '@/lib/calendar/schedule-drop';
import { verifyAndReconcilePost } from '@/lib/calendar/verify-post';
import { notifyPartialFailureGuarded } from '@/lib/calendar/notify-partial-failure';
import { resolveScheduledPostMedia } from '@/lib/calendar/resolve-media';
import { buildChatCard, postToGoogleChatSafe } from '@/lib/chat/post-to-google-chat';
import {
  isAccountLevelLegError,
  isZernioGlobalAuthError,
  markProfileDisconnectedFromLegFailure,
} from '@/lib/posting/zernio-account-errors';
import { checkLegReadinessBatch } from '@/lib/posting/check-publish-readiness';
import {
  notifyConnectionExpired,
  type ConnectionExpiredCandidate,
} from '@/lib/posting/notify-connection-expired';
import { recordLatePostIdChange } from '@/lib/posting/late-post-id-history';

const STALE_ALERT_PREFIX = 'Stale draft: scheduled time passed without approval';

export const maxDuration = 300;

// 1 initial attempt + 2 retries = 3 total attempts. After the third failure
// the post is marked `failed` and the team is notified.
const MAX_RETRIES = 3;
// Fixed 30 minute delay between retries. Earlier we used exponential backoff
// (2/4/8 min) which doubled-down on transient platform errors faster than the
// upstream rate limits cleared. 30 min is long enough for most carrier-side
// blips to resolve and short enough that the team still sees the recovery
// happen on the same shift.
const RETRY_DELAY_MS = 30 * 60 * 1000;
const BATCH_SIZE = 5;

/**
 * GET /api/cron/publish-posts
 *
 * Vercel cron job (every 2 minutes): publish scheduled posts that are due. Processes up to
 * 5 posts per run. Retries failed posts every 30 minutes up to MAX_RETRIES total attempts.
 * On `partially_failed` posts only the failed/pending platform legs are re-fired (already
 * published legs are never republished). Sends an in-app failure notification when all
 * retries are exhausted. Requires CRON_SECRET bearer token.
 *
 * @auth Bearer CRON_SECRET (Vercel cron)
 * @returns {{ message: string, published: number, failed: number }}
 */
async function handleGet(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const postingService = getPostingService();

    // Find posts ready to publish
    const { data: pendingPosts, error: queryError } = await adminClient
      .from('scheduled_posts')
      .select(`
        *,
        scheduled_post_platforms (
          id,
          social_profile_id,
          status,
          social_profiles (
            id,
            platform,
            username,
            access_token_ref,
            late_account_id,
            is_active,
            token_status,
            account_owner,
            disconnect_alerted_at
          )
        ),
        scheduled_post_media (
          sort_order,
          scheduler_media (
            storage_path,
            thumbnail_url,
            mime_type
          )
        )
      `)
      // `partially_failed` is included so we can retry just the failed legs
      // of a partial publish. The per-leg filter below ensures already-
      // published platforms are never republished.
      .in('status', ['scheduled', 'publishing', 'partially_failed'])
      .lte('scheduled_at', new Date().toISOString())
      .lt('retry_count', MAX_RETRIES)
      .order('scheduled_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (queryError) {
      console.error('Cron query error:', queryError);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

    let publishedCount = 0;
    let failedCount = 0;
    let staleAlertedCount = 0;

    // PUB-01: collected across every post in this cron run. After the
    // loop, we fire one chat card per affected client summarizing every
    // leg whose token came back dead at publish time. The per-leg
    // `social_profiles.disconnect_alerted_at` stamp set inside the loop
    // dedups against the daily watcher so the same incident never
    // double-pings.
    const tokenDeadCandidates: ConnectionExpiredCandidate[] = [];

    // Note: don't early-return on empty pendingPosts — we still need to
    // run the stale-draft scan below.

    for (const post of pendingPosts ?? []) {
      try {
        // ATOMIC CLAIM — prevents two cron invocations from both publishing
        // the same row to Zernio. The SELECT above can return the same row
        // to overlapping invocations (Vercel can re-fire if a previous run
        // stalls past the schedule, and `'publishing'` rows from a stuck
        // earlier run are intentionally re-grabbed for recovery). Without
        // this CAS, both workers pass the approval gate, both flip to
        // 'publishing', and both POST to Zernio — the second `late_post_id`
        // overwrites the first, leaving the original Zernio post live with
        // no DB row pointing at it (silent duplicate publish).
        //
        // CAS on `updated_at`: only flip to 'publishing' if the row's
        // `updated_at` matches what we just read. The first worker wins;
        // the second's UPDATE returns 0 rows and we skip cleanly. There's
        // no DB-level update trigger on `scheduled_posts.updated_at` (only
        // a refund trigger on DELETE) so this is a true CAS.
        const claimNowIso = new Date().toISOString();
        const { data: claimed } = await adminClient
          .from('scheduled_posts')
          .update({ status: 'publishing', updated_at: claimNowIso })
          .eq('id', post.id)
          .eq('updated_at', post.updated_at)
          .in('status', ['scheduled', 'publishing', 'partially_failed'])
          .select('id')
          .maybeSingle();
        if (!claimed) {
          console.log(
            `[publish-cron] skipped ${post.id} — claimed by another worker`,
          );
          continue;
        }
        // Refresh our in-memory copy so any subsequent UPDATE keyed off
        // updated_at uses the new value (currently no-op — no later CAS in
        // this block — but cheap insurance against future edits).
        post.updated_at = claimNowIso;

        // APPROVAL GATE — defense in depth.
        //
        // Posts that came from a content calendar drop MUST have an explicit
        // approval comment from the share link before we ship them. The
        // upstream invariant (`scheduleDrop` only flips draft → scheduled
        // through `publishScheduledPost`, which is only called from the
        // share-link approval handler) has broken at least once and put
        // unapproved posts into the publish queue. We refuse to publish
        // them here regardless of how they got into 'scheduled' state.
        //
        // Non-drop posts (quick-schedule, social ads, etc.) are unaffected:
        // those flows don't create a `content_drop_videos` row, so the
        // `from_drop` check below is false and they proceed normally.
        const { data: dropVideo } = await adminClient
          .from('content_drop_videos')
          .select('id')
          .eq('scheduled_post_id', post.id)
          .maybeSingle();
        if (dropVideo) {
          const { data: reviewLinkRows } = await adminClient
            .from('post_review_links')
            .select('id')
            .eq('post_id', post.id);
          const reviewLinkIds = (reviewLinkRows ?? []).map(
            (r) => (r as { id: string }).id,
          );
          let approved = false;
          if (reviewLinkIds.length > 0) {
            const { count } = await adminClient
              .from('post_review_comments')
              .select('id', { count: 'exact', head: true })
              .in('review_link_id', reviewLinkIds)
              .eq('status', 'approved');
            approved = (count ?? 0) > 0;
          }
          if (!approved) {
            // Hard-fail (skip retry): no amount of retries fixes this.
            // The post must be re-routed through approval.
            await adminClient
              .from('scheduled_posts')
              .update({
                status: 'failed',
                failure_reason:
                  'Approval gate: drop post was queued without an approved review comment. Re-route through the share link approval flow.',
                retry_count: MAX_RETRIES,
                updated_at: new Date().toISOString(),
              })
              .eq('id', post.id);
            console.error(
              `[publish-cron] BLOCKED unapproved drop post ${post.id} (client ${post.client_id}). ` +
                `Re-route through share link approval flow.`,
            );
            failedCount++;
            try {
              await sendFailureNotification(adminClient, {
                ...post,
                failure_reason:
                  'Approval gate: drop post was queued without an approved review comment.',
              } as Record<string, unknown>);
            } catch (emailErr) {
              console.error('Failed to send approval-gate notification:', emailErr);
            }
            continue;
          }
        }

        // Mark as publishing
        await adminClient
          .from('scheduled_posts')
          .update({ status: 'publishing', updated_at: new Date().toISOString() })
          .eq('id', post.id);

        // Resolve the publish-time media payload via the shared resolver.
        // Mux-aware so revisions ship the rendered MP4 instead of the
        // schedule-time snapshot. Throws when Mux MP4 isn't ready yet, which
        // bumps retry_count via the catch block. See `lib/calendar/resolve-media.ts`.
        const { videoUrl, mediaItems } = await resolveScheduledPostMedia(
          adminClient,
          post.id,
          post.post_type,
        );

        // Build platform profile map. Zernio expects its own MongoDB
        // ObjectId (`social_profiles.late_account_id`) as the platform
        // accountId, NOT our internal UUID. Drop any spp rows whose
        // social profile hasn't been connected to Zernio yet (no
        // late_account_id) -- they'd 400 anyway. Keep an internal
        // map so we can reverse-lookup the spp row when Zernio echoes
        // accountId back in the publish response.
        //
        // PER-LEG RETRY: only fire legs whose status is 'pending' or
        // 'failed'. On a `partially_failed` retry, the platforms that
        // already published stay in 'published' and we never re-fire them
        // (re-firing would dupe the post on those platforms — exactly the
        // double-publish bug we hit on May 1). On a fresh `scheduled` run
        // every leg is 'pending' so this filter is a no-op for first
        // attempts.
        type PlatformProfile = {
          profileId: string;
          lateAccountId: string;
          platform: SocialPlatform;
        };
        // Stamp legs whose social profile is NOT connected to Zernio (NULL
        // late_account_id) as 'failed' with a clear reason BEFORE filtering.
        // Silently dropping them (the prior behaviour) hid the root cause,
        // the spp row stayed 'pending' forever, the calendar UI showed no
        // failure, and the team had no breadcrumb that "Reconnect Zernio"
        // was the fix. Now the leg-level failure_reason names the platform
        // and the publishing UX has a real signal.
        //
        // Phase 5 extension: also short-circuit legs whose profile is
        // marked inactive (is_active=false) or whose cached token_status
        // is bad (expired / needs_refresh). Both columns are kept current
        // by the webhook handler and the connection-expired-watch cron
        // respectively. Skipping these BEFORE we hit Zernio saves a
        // round-trip that would 401 anyway, and gives operators a
        // surgical reason like "TikTok token expired, reconnect" instead
        // of a generic Zernio error.
        const unconnectedFailures: { platform: string; username: string | null; reason: string }[] = [];
        for (const spp of (post.scheduled_post_platforms ?? []) as Record<string, unknown>[]) {
          const sppStatus = (spp.status as string | null) ?? 'pending';
          if (sppStatus !== 'pending' && sppStatus !== 'failed') continue;
          const profile = spp.social_profiles as Record<string, unknown> | null;
          const lateAccountId = (profile?.late_account_id ?? null) as string | null;
          const isActive = (profile?.is_active as boolean | null) ?? true;
          const tokenStatus = (profile?.token_status as string | null) ?? null;
          const platformName = (profile?.platform as string | null) ?? 'unknown';
          const username = (profile?.username as string | null) ?? null;

          let reason: string | null = null;
          if (!lateAccountId) {
            reason = `${platformName} profile is not connected to Zernio (no late_account_id). Reconnect the profile in social settings before retrying.`;
          } else if (!isActive) {
            reason = `${platformName} profile is inactive — Zernio reported the account disconnected. Reconnect in scheduler before retrying.`;
          } else if (tokenStatus === 'expired' || tokenStatus === 'needs_refresh') {
            reason = `${platformName} token is ${tokenStatus.replace('_', ' ')}. Reconnect the account so Zernio can refresh authorization.`;
          }
          if (!reason) continue;

          await adminClient
            .from('scheduled_post_platforms')
            .update({ status: 'failed', failure_reason: reason })
            .eq('id', spp.id as string);
          unconnectedFailures.push({ platform: platformName, username, reason });
        }

        // PUB-01: live token readiness probe.
        //
        // The cheap pre-flight above trusts `social_profiles.token_status`,
        // which is refreshed once every 6h by `connection-expired-watch`.
        // A token that died between the last watcher run and now will sail
        // through with `token_status = 'valid'`, hit Zernio at publishPost
        // time, fail per-leg, and burn the full retry cycle before the team
        // gets a chat ping. We ask Zernio's `/accounts/{id}/health` directly
        // for every still-eligible leg right before publish so a dead token
        // becomes an immediate `failed` leg with `token_dead_at_publish` as
        // the reason — no retry queue, no 1.5h-late notification.
        //
        // Cache (90s) lives in `check-publish-readiness.ts` so all legs
        // across all posts in this cron tick reuse the answer per account.
        const probeCandidates: Array<{
          sppId: string;
          lateAccountId: string;
          profileId: string;
          platform: string;
          username: string | null;
          clientId: string;
          accountOwner: string;
          disconnectAlertedAt: string | null;
        }> = [];
        for (const spp of (post.scheduled_post_platforms ?? []) as Record<string, unknown>[]) {
          const sppStatus = (spp.status as string | null) ?? 'pending';
          if (sppStatus !== 'pending' && sppStatus !== 'failed') continue;
          const profile = spp.social_profiles as Record<string, unknown> | null;
          const lateAccountId = (profile?.late_account_id ?? null) as string | null;
          const isActive = (profile?.is_active as boolean | null) ?? true;
          const tokenStatus = (profile?.token_status as string | null) ?? null;
          // Skip legs the cheap pre-flight already eliminated — they're
          // already stamped `failed` in DB and we don't want to waste a
          // Zernio round-trip confirming what we already know.
          if (!lateAccountId) continue;
          if (!isActive) continue;
          if (tokenStatus === 'expired' || tokenStatus === 'needs_refresh') continue;
          probeCandidates.push({
            sppId: spp.id as string,
            lateAccountId,
            profileId: spp.social_profile_id as string,
            platform: (profile?.platform as string | null) ?? 'unknown',
            username: (profile?.username as string | null) ?? null,
            clientId: post.client_id as string,
            accountOwner: (profile?.account_owner as string | null) ?? 'unknown',
            disconnectAlertedAt:
              (profile?.disconnect_alerted_at as string | null) ?? null,
          });
        }

        const liveBadLateAccountIds = new Set<string>();
        if (probeCandidates.length > 0) {
          const readinessMap = await checkLegReadinessBatch(
            probeCandidates.map((c) => c.lateAccountId),
          );
          for (const cand of probeCandidates) {
            const readiness = readinessMap.get(cand.lateAccountId);
            if (!readiness || readiness.ready) continue;
            // Transient probe failure: don't fail the leg, let publishPost
            // take its normal path. Only durable token-bad answers
            // short-circuit here.
            if (readiness.reason === 'probe_failed') continue;

            liveBadLateAccountIds.add(cand.lateAccountId);
            const reason = `${cand.platform}: ${readiness.detail ?? 'token dead at publish'}`;

            await adminClient
              .from('scheduled_post_platforms')
              .update({ status: 'failed', failure_reason: reason })
              .eq('id', cand.sppId);
            unconnectedFailures.push({
              platform: cand.platform,
              username: cand.username,
              reason,
            });

            // Stamp the profile so the daily watcher dedups against this
            // incident. Only stamp `disconnect_alerted_at` if currently
            // NULL — if it's set, the watcher (or a prior cron tick)
            // already pinged for this expiry cycle.
            const profileUpdate: Record<string, unknown> = {
              token_status: 'expired',
              token_expires_at: readiness.health?.tokenExpiresAt ?? null,
            };
            const shouldPing = cand.disconnectAlertedAt == null;
            if (shouldPing) {
              profileUpdate.disconnect_alerted_at = new Date().toISOString();
            }
            await adminClient
              .from('social_profiles')
              .update(profileUpdate)
              .eq('id', cand.profileId);

            if (shouldPing) {
              tokenDeadCandidates.push({
                profileId: cand.profileId,
                clientId: cand.clientId,
                platform: cand.platform,
                accountOwner: cand.accountOwner,
                username: cand.username,
              });
            }
          }
        }

        const platformProfiles: PlatformProfile[] = (
          post.scheduled_post_platforms ?? []
        )
          .map((spp: Record<string, unknown>): PlatformProfile | null => {
            const sppStatus = (spp.status as string | null) ?? 'pending';
            // Skip legs that already published, never re-fire them, AND
            // skip the legs we just stamped 'failed' above (inactive /
            // bad token / no late_account_id). The unconnectedFailures
            // loop already wrote the failure_reason; trying to publish
            // them again here would either 401 or worse, succeed on a
            // resurrected account and create a ghost post.
            if (sppStatus !== 'pending' && sppStatus !== 'failed') return null;
            const profile = spp.social_profiles as Record<string, unknown> | null;
            const lateAccountId = (profile?.late_account_id ?? null) as string | null;
            const isActive = (profile?.is_active as boolean | null) ?? true;
            const tokenStatus = (profile?.token_status as string | null) ?? null;
            if (!lateAccountId) return null;
            if (!isActive) return null;
            if (tokenStatus === 'expired' || tokenStatus === 'needs_refresh') return null;
            // PUB-01: drop legs whose live probe came back dead in this
            // tick. The in-memory `tokenStatus` from the original DB read
            // may still say 'valid' even though Zernio's authoritative
            // health endpoint just said otherwise, so we have to consult
            // the live-bad set explicitly.
            if (liveBadLateAccountIds.has(lateAccountId)) return null;
            return {
              profileId: spp.social_profile_id as string,
              lateAccountId,
              platform: (profile?.platform ?? 'instagram') as SocialPlatform,
            };
          })
          .filter(
            (p: PlatformProfile | null): p is PlatformProfile => p !== null,
          );

        if (platformProfiles.length === 0) {
          // Every leg either already shipped (skip) or has no late_account_id
          // (just stamped failed above). Mark the post terminal so we don't
          // retry forever, and surface the real reason on the parent row.
          if (unconnectedFailures.length > 0) {
            const reason = unconnectedFailures
              .map((f) => `${f.platform}: not connected to Zernio`)
              .join(' | ');
            await adminClient
              .from('scheduled_posts')
              .update({
                status: 'partially_failed',
                retry_count: MAX_RETRIES,
                failure_reason: reason,
                updated_at: new Date().toISOString(),
              })
              .eq('id', post.id);
            try {
              await notifyPartialFailureGuarded(
                adminClient,
                post,
                unconnectedFailures,
                sendPartialFailureNotification,
              );
            } catch (notifyErr) {
              console.error('Failed to send unconnected-profile notification:', notifyErr);
            }
            failedCount++;
            continue;
          }
          throw new Error(
            'No connected social profiles to publish to (missing late_account_id). Reconnect the social profile via Zernio.',
          );
        }

        const platformHints: Record<string, SocialPlatform> = {};
        platformProfiles.forEach((p: PlatformProfile) => {
          platformHints[p.lateAccountId] = p.platform;
        });

        // Reverse map: late_account_id (what Zernio echoes back) -> our
        // internal social_profile_id (UUID), so we can update the right
        // spp row from the publish response.
        const lateIdToProfileId: Record<string, string> = {};
        platformProfiles.forEach((p: PlatformProfile) => {
          lateIdToProfileId[p.lateAccountId] = p.profileId;
        });

        // DUPE GUARD — if Zernio already has this post queued
        // (`late_post_id` set from a prior cron tick or schedule-time
        // queueing), re-running publishPost would create a SECOND Zernio
        // post on the same calendar slot. Probe Zernio for the existing
        // post and reconcile each leg from its authoritative response
        // instead of re-publishing.
        //
        // Mapping: Zernio's PlatformResult.status `published` → spp
        // 'published', `failed` → 'failed', `scheduled` (Zernio-queued
        // but platform hasn't confirmed) → 'pending'. If Zernio returns
        // null/errors, clear `late_post_id` so the next tick re-publishes
        // fresh — that handles the case where the queued copy was
        // cancelled (or never created).
        if (post.late_post_id) {
          let zernioStatus: Awaited<ReturnType<typeof postingService.getPostStatus>> | null = null;
          try {
            zernioStatus = await postingService.getPostStatus(post.late_post_id as string);
          } catch (probeErr) {
            console.warn(
              `[publish-cron] getPostStatus failed for ${post.id} (late_post_id=${post.late_post_id}); clearing and re-publishing next tick`,
              probeErr,
            );
          }

          if (!zernioStatus) {
            await adminClient
              .from('scheduled_posts')
              .update({
                late_post_id: null,
                status: 'scheduled',
                updated_at: new Date().toISOString(),
              })
              .eq('id', post.id);
            await recordLatePostIdChange(adminClient, post.id, null);
            console.log(`[publish-cron] cleared stale late_post_id for ${post.id}`);
            continue;
          }

          const failedDetails: { platform: string; username: string | null; reason: string }[] = [];
          for (const z of zernioStatus.platforms) {
            const internalProfileId = lateIdToProfileId[z.profileId] ?? z.profileId;
            const spp = (post.scheduled_post_platforms ?? []).find(
              (s: Record<string, unknown>) => s.social_profile_id === internalProfileId,
            );
            if (!spp) continue;
            const sppStatus =
              z.status === 'published'
                ? 'published'
                : z.status === 'failed'
                  ? 'failed'
                  : 'pending';
            const sppUpdate: Record<string, unknown> = {
              status: sppStatus,
              external_post_id: z.externalPostId ?? null,
              external_post_url: z.externalPostUrl ?? null,
              failure_reason: z.status === 'failed' ? z.error ?? null : null,
            };
            // PUB-02: stamp published_at on the first transition to
            // 'published' so the verify cron can scope its window.
            if (sppStatus === 'published') {
              sppUpdate.published_at = new Date().toISOString();
              // A fresh publish resets any prior 'unverifiable' / 'pending'
              // state so the verify pass treats this like a brand-new leg.
              sppUpdate.verification_status = 'pending';
              sppUpdate.verification_attempts = 0;
              sppUpdate.verification_detail = null;
              sppUpdate.last_verified_at = null;
            }
            await adminClient
              .from('scheduled_post_platforms')
              .update(sppUpdate)
              .eq('id', (spp as Record<string, unknown>).id);

            if (z.status === 'failed') {
              const sppRecord = spp as { social_profiles?: { platform?: string; username?: string | null } };
              failedDetails.push({
                platform: sppRecord.social_profiles?.platform ?? z.profileId,
                username: sppRecord.social_profiles?.username ?? null,
                reason: z.error ?? 'Unknown error from Zernio',
              });
            }
          }

          const { data: freshSppRows } = await adminClient
            .from('scheduled_post_platforms')
            .select('status')
            .eq('post_id', post.id);
          const sppStatuses = (freshSppRows ?? []).map(
            (r) => (r as { status: string }).status,
          );
          const allPublished =
            sppStatuses.length > 0 && sppStatuses.every((s) => s === 'published');
          const anyFailed = sppStatuses.some((s) => s === 'failed');
          const anyPending = sppStatuses.some((s) => s === 'pending');

          const currentRetryCount = (post.retry_count ?? 0) as number;
          const retriesRemaining = currentRetryCount + 1 < MAX_RETRIES;

          let probeNewStatus: 'published' | 'partially_failed' | 'scheduled';
          let probeUpdate: Record<string, unknown>;
          if (allPublished) {
            probeNewStatus = 'published';
            probeUpdate = {
              status: 'published',
              published_at: new Date().toISOString(),
              failure_reason: null,
              // Clear the dedup stamps so a future failure / stuck on this
              // row can re-page (e.g. caption edit + republish).
              failure_notification_sent_at: null,
              stuck_publishing_alerted_at: null,
              updated_at: new Date().toISOString(),
            };
          } else if (anyFailed && !anyPending) {
            // Zernio's stored copy has permanently-failed legs. Probing
            // the same post again will return the same failure forever
            // (Zernio doesn't auto-recover failed legs within a post).
            // If we still have retry budget, drop late_post_id and re-
            // schedule so the next cron tick takes the publish path with
            // current code. The per-leg filter (`status !== 'pending' &&
            // status !== 'failed' → skip`) guarantees only the failed legs
            // re-fire; already-published legs stay protected.
            //
            // This is what makes payload-bug fixes (e.g. da02ba93 dropping
            // the bad `video_cover_image_url` TikTok field) actually
            // propagate to stuck posts instead of needing manual rescue.
            if (retriesRemaining) {
              probeNewStatus = 'scheduled';
              probeUpdate = {
                status: 'scheduled',
                late_post_id: null,
                retry_count: currentRetryCount + 1,
                scheduled_at: new Date(Date.now() + RETRY_DELAY_MS).toISOString(),
                updated_at: new Date().toISOString(),
              };
              console.log(
                `[publish-cron] cleared late_post_id on partially-failed probe for ${post.id} (retry ${currentRetryCount + 1}/${MAX_RETRIES}); failed legs will re-publish with current payload`,
              );
            } else {
              probeNewStatus = 'partially_failed';
              probeUpdate = {
                status: 'partially_failed',
                retry_count: currentRetryCount + 1,
                failure_reason: failedDetails.length
                  ? failedDetails
                      .map((f) => `${f.platform}: ${f.reason}`)
                      .join(' | ') + ' (Zernio probe)'
                  : null,
                updated_at: new Date().toISOString(),
              };
            }
          } else {
            // At least one leg still pending — Zernio hasn't fired all
            // platforms yet. Stay scheduled so the next tick probes again
            // (no retry bump, no scheduled_at push). Acts like the
            // verify-post sweep but bound to this row.
            probeNewStatus = 'scheduled';
            probeUpdate = {
              status: 'scheduled',
              updated_at: new Date().toISOString(),
            };
          }

          await adminClient
            .from('scheduled_posts')
            .update(probeUpdate)
            .eq('id', post.id);

          if (Object.prototype.hasOwnProperty.call(probeUpdate, 'late_post_id')) {
            const next = (probeUpdate as { late_post_id?: string | null }).late_post_id ?? null;
            await recordLatePostIdChange(adminClient, post.id, next);
          }

          if (probeNewStatus === 'partially_failed' && !retriesRemaining && failedDetails.length > 0) {
            try {
              await notifyPartialFailureGuarded(
                adminClient,
                post,
                failedDetails,
                sendPartialFailureNotification,
              );
            } catch (notifyErr) {
              console.error('Failed to send partial-failure notification (Zernio probe):', notifyErr);
            }
          }

          if (allPublished) publishedCount++;
          console.log(
            `[publish-cron] reconciled ${post.id} from Zernio late_post_id=${post.late_post_id} → ${probeNewStatus}`,
          );
          continue;
        }

        // PRE-FLIGHT: image posts targeting Instagram must satisfy the
        // 0.75-1.91 feed aspect rule, otherwise Zernio returns a hard 400 and
        // we burn 3 retries plus a "posting health alert" email before the
        // post is marked failed. Pre-rejecting the IG leg here keeps the
        // retry quota for transient failures and lets the other platforms
        // (TikTok, Facebook, LinkedIn) publish uninterrupted. Helper lives
        // in lib/posting/validate-image-aspect.ts so the approval-driven
        // path uses identical logic.
        const preFlightFailures: { platform: string; username: string | null; reason: string }[] = [
          ...unconnectedFailures,
        ];
        const targetsInstagram = platformProfiles.some((p: PlatformProfile) => p.platform === 'instagram');
        if (targetsInstagram) {
          const igIssue = await preflightInstagramAspectForPost(adminClient, post.id, post.post_type);
          if (igIssue) {
            const igLegs = platformProfiles.filter((pp) => pp.platform === 'instagram');
            for (const leg of igLegs) {
              const spp = (post.scheduled_post_platforms ?? []).find(
                (s: Record<string, unknown>) => s.social_profile_id === leg.profileId,
              );
              if (spp) {
                await adminClient
                  .from('scheduled_post_platforms')
                  .update({
                    status: 'failed',
                    failure_reason: igIssue.reason,
                  })
                  .eq('id', (spp as Record<string, unknown>).id);
                const sppRecord = spp as { social_profiles?: { username?: string | null } };
                preFlightFailures.push({
                  platform: 'instagram',
                  username: sppRecord.social_profiles?.username ?? null,
                  reason: igIssue.reason,
                });
              }
            }
            // Drop the IG legs so we don't ship them to Zernio.
            const filtered = platformProfiles.filter((pp) => pp.platform !== 'instagram');
            platformProfiles.length = 0;
            platformProfiles.push(...filtered);
            console.warn(
              `[publish-cron] pre-flight rejected IG leg(s) for ${post.id}: ${igIssue.reason}`,
            );
          }
        }

        if (platformProfiles.length === 0) {
          // Every leg was pre-rejected (e.g. IG-only post with bad ratio, or
          // every profile is unconnected). Mark the post terminal-failed and
          // surface the reason. Skip the retry path because the input is
          // deterministic — re-running won't help.
          const reasonText = preFlightFailures.length
            ? preFlightFailures.map((f) => `${f.platform}: ${f.reason}`).join(' | ')
            : 'No publishable platforms after pre-flight checks.';
          await adminClient
            .from('scheduled_posts')
            .update({
              status: 'partially_failed',
              retry_count: MAX_RETRIES,
              failure_reason: reasonText,
              updated_at: new Date().toISOString(),
            })
            .eq('id', post.id);
          try {
            await notifyPartialFailureGuarded(
              adminClient,
              post,
              preFlightFailures,
              sendPartialFailureNotification,
            );
          } catch (notifyErr) {
            console.error('Failed to send pre-flight failure notification:', notifyErr);
          }
          failedCount++;
          continue;
        }

        // Publish via posting service.
        //
        // Why we use `publishPost` (POST /posts) for retries rather than
        // Zernio's `posts.retryPost()` (POST /posts/{id}/retry):
        //   - /retry replays the ORIGINAL payload Zernio stored at first
        //     publish time. If we shipped a buggy field (e.g. the
        //     undocumented `video_cover_image_url` on TikTok that crashed
        //     ffmpeg-thumbnail-stitch deterministically for Joseph
        //     Pytcher's Weston Funding post), /retry just replays the
        //     crash forever.
        //   - Building a fresh `publishPost` call with only the
        //     failed/pending legs (per-leg filter above) lets payload
        //     fixes propagate the next time the cron tick runs, and the
        //     already-published legs are protected by the spp-status
        //     filter so we never double-publish them.
        //   - The `late_post_id` rotates on each retry; that's acceptable
        //     because we treat the most-recent attempt as authoritative.
        // `retryPost()` remains available on the service for a future
        // admin "Force Zernio-side retry" affordance where the operator
        // is sure the original payload is fine.
        //
        // Per-platform overrides (migration 218) live on the same
        // `scheduled_posts` row. NULL means "use buildPublishBody's
        // defaults", so we pass `?? undefined` to keep that fallthrough
        // intact for posts that haven't customized anything.
        const p = post as typeof post & {
          youtube_title: string | null;
          youtube_description: string | null;
          youtube_tags: string[] | null;
          youtube_privacy: 'public' | 'unlisted' | 'private' | null;
          youtube_made_for_kids: boolean | null;
          tiktok_allow_comment: boolean | null;
          tiktok_allow_duet: boolean | null;
          tiktok_allow_stitch: boolean | null;
          instagram_share_to_feed: boolean | null;
          instagram_content_type: 'feed' | 'reels' | 'story' | null;
          facebook_content_type: 'feed' | 'reel' | 'story' | null;
          facebook_page_id: string | null;
          linkedin_document_title: string | null;
          linkedin_organization_urn: string | null;
          linkedin_disable_link_preview: boolean | null;
          first_comment: string | null;
        };

        // Pre-flight: ask Zernio to validate the payload before we burn a
        // publish slot. Validation failures are deterministic (caption too
        // long, missing field, unsupported media combo) — retrying buys
        // nothing. Mark the post terminal-failed and notify, so the team
        // fixes the payload rather than letting the retry queue grind.
        // Method silently no-ops on 404 if Zernio's plan excludes validation.
        const validateMediaUrls = mediaItems?.length
          ? mediaItems.map((m) => m.url).filter((u): u is string => !!u)
          : videoUrl
            ? [videoUrl]
            : [];
        const zernioPreflight = new ZernioPostingService();
        const validation = await zernioPreflight.validatePost({
          caption: post.caption ?? '',
          hashtags: post.hashtags ?? [],
          mediaUrls: validateMediaUrls,
          platforms: platformProfiles.map((pp: PlatformProfile) => pp.platform),
        });
        if (!validation.ok && validation.issues.length > 0) {
          const reasonText = validation.issues
            .map((i) => {
              const platform = i.platform ? `${i.platform}: ` : '';
              const field = i.field ? `[${i.field}] ` : '';
              const code = i.code ? ` (${i.code})` : '';
              return `${platform}${field}${i.message}${code}`;
            })
            .join(' | ');
          console.warn(
            `[publish-cron] Zernio validatePost rejected ${post.id}: ${reasonText}`,
          );
          await adminClient
            .from('scheduled_posts')
            .update({
              status: 'partially_failed',
              retry_count: MAX_RETRIES,
              failure_reason: `Zernio pre-flight validation rejected: ${reasonText}`,
              updated_at: new Date().toISOString(),
            })
            .eq('id', post.id);
          // Stamp the relevant per-platform leg(s) so the UI surfaces what
          // failed; issues with no platform get applied to every leg.
          for (const issue of validation.issues) {
            const targetLegs = (post.scheduled_post_platforms ?? []).filter(
              (s: Record<string, unknown>) => {
                if (!issue.platform) return true;
                const sp = s.social_profiles as { platform?: string } | undefined;
                return sp?.platform === issue.platform;
              },
            );
            for (const leg of targetLegs) {
              await adminClient
                .from('scheduled_post_platforms')
                .update({
                  status: 'failed',
                  failure_reason: `${issue.field ? `[${issue.field}] ` : ''}${issue.message}${issue.code ? ` (${issue.code})` : ''}`,
                })
                .eq('id', (leg as Record<string, unknown>).id);
            }
          }
          try {
            await notifyPartialFailureGuarded(
              adminClient,
              post,
              validation.issues.map((i) => ({
                platform: typeof i.platform === 'string' ? i.platform : 'unknown',
                username: null,
                reason: i.message,
              })),
              sendPartialFailureNotification,
            );
          } catch (notifyErr) {
            console.error('Failed to send validation failure notification:', notifyErr);
          }
          failedCount++;
          continue;
        }

        const result = await postingService.publishPost({
          videoUrl,
          mediaItems,
          caption: post.caption ?? '',
          hashtags: post.hashtags ?? [],
          coverImageUrl: post.cover_image_url ?? undefined,
          taggedPeople: post.tagged_people ?? [],
          collaboratorHandles: post.collaborator_handles ?? [],
          platformProfileIds: platformProfiles.map((p: PlatformProfile) => p.lateAccountId),
          platformHints,
          youtubeTitle: p.youtube_title ?? undefined,
          youtubeDescription: p.youtube_description ?? undefined,
          youtubeTags: p.youtube_tags ?? undefined,
          youtubePrivacy: p.youtube_privacy ?? undefined,
          youtubeMadeForKids: p.youtube_made_for_kids ?? undefined,
          tiktokAllowComment: p.tiktok_allow_comment ?? undefined,
          tiktokAllowDuet: p.tiktok_allow_duet ?? undefined,
          tiktokAllowStitch: p.tiktok_allow_stitch ?? undefined,
          instagramShareToFeed: p.instagram_share_to_feed ?? undefined,
          // Per-platform routing overrides (migration 255). NULL → undefined
          // so each builder applies its documented default.
          instagramContentType: p.instagram_content_type ?? undefined,
          facebookContentType: p.facebook_content_type ?? undefined,
          facebookPageId: p.facebook_page_id ?? undefined,
          linkedinDocumentTitle: p.linkedin_document_title ?? undefined,
          linkedinOrganizationUrn: p.linkedin_organization_urn ?? undefined,
          linkedinDisableLinkPreview: p.linkedin_disable_link_preview ?? undefined,
          firstComment: p.first_comment ?? undefined,
        });

        // Update per-platform results for the legs we just attempted.
        const failedPlatformDetails: { platform: string; username: string | null; reason: string }[] = [];

        for (const platformResult of result.platforms) {
          // Zernio returns the late_account_id we sent it; translate
          // back to our internal UUID before matching the spp row.
          const internalProfileId =
            lateIdToProfileId[platformResult.profileId] ?? platformResult.profileId;
          const spp = (post.scheduled_post_platforms ?? []).find(
            (s: Record<string, unknown>) => s.social_profile_id === internalProfileId,
          );
          if (spp) {
            // Zernio's PlatformResult.status is 'published' | 'scheduled' | 'failed'.
            // 'scheduled' means Zernio accepted the leg and is still queued —
            // the platform itself hasn't confirmed yet. Map that to spp 'pending'
            // (still in flight) instead of the prior 'failed' which polluted the
            // failure notifier and the calendar dots. The Weston Funding TikTok+YT
            // legs on 2026-05-04 were 'scheduled' but our DB showed them failed
            // with NULL failure_reason — that was the conflation, not a real failure.
            const sppStatus =
              platformResult.status === 'published'
                ? 'published'
                : platformResult.status === 'failed'
                  ? 'failed'
                  : 'pending';
            const sppUpdate: Record<string, unknown> = {
              status: sppStatus,
              external_post_id: platformResult.externalPostId ?? null,
              external_post_url: platformResult.externalPostUrl ?? null,
              failure_reason: platformResult.status === 'failed' ? platformResult.error ?? null : null,
            };
            // PUB-02: stamp published_at on the first transition to
            // 'published' so the verify cron can scope its window. Reset
            // any prior verification state so a re-publish gets a fresh
            // round-trip check.
            if (sppStatus === 'published') {
              sppUpdate.published_at = new Date().toISOString();
              sppUpdate.verification_status = 'pending';
              sppUpdate.verification_attempts = 0;
              sppUpdate.verification_detail = null;
              sppUpdate.last_verified_at = null;
            }
            await adminClient
              .from('scheduled_post_platforms')
              .update(sppUpdate)
              .eq('id', (spp as Record<string, unknown>).id);
          }

          if (platformResult.status === 'failed') {
            const sppRecord = spp as { social_profiles?: { platform?: string; username?: string | null } } | undefined;
            const reason = platformResult.error ?? 'Unknown error';
            failedPlatformDetails.push({
              platform: sppRecord?.social_profiles?.platform ?? platformResult.profileId,
              username: sppRecord?.social_profiles?.username ?? null,
              reason,
            });

            // Account-level errors (token expired, permission denied, etc.)
            // are deterministic — retrying the same payload with the same
            // token keeps failing until the user reconnects. Flip the
            // profile to inactive + fire a one-time disconnect notification
            // so the team can ask the client to reconnect, instead of
            // burning the rest of MAX_RETRIES on the same dead token. Prefer
            // the structured envelope (errorCode/errorType) when Zernio
            // surfaced it — regex fallback if not.
            if (
              isAccountLevelLegError({
                errorCode: platformResult.errorCode,
                errorType: platformResult.errorType,
                message: platformResult.errorMessage ?? reason,
              })
            ) {
              try {
                await markProfileDisconnectedFromLegFailure({
                  admin: adminClient,
                  lateAccountId: platformResult.profileId,
                  reason,
                });
              } catch (markErr) {
                console.error(
                  `[publish-posts] disconnect-mark failed for ${platformResult.profileId}:`,
                  markErr,
                );
              }
            }
          }
        }

        // Fold pre-flight rejections (e.g. Instagram aspect-ratio violations)
        // into the same failure list so the team-notify email + failure_reason
        // text on `scheduled_posts` cite the actual cause instead of a generic
        // "Instagram failed."
        if (preFlightFailures.length > 0) {
          failedPlatformDetails.push(...preFlightFailures);
        }

        // Re-query the FULL spp set to derive true overall status. With per-
        // leg retry we may have skipped already-published legs in this pass,
        // so we cannot infer the post's overall state from `result.platforms`
        // alone — we have to look at every spp row. allPublished requires
        // every leg to be 'published'; anyFailed is true if at least one
        // leg is 'failed' AFTER the per-leg updates above committed.
        const { data: freshSppRows } = await adminClient
          .from('scheduled_post_platforms')
          .select('status')
          .eq('post_id', post.id);
        const sppStatuses = (freshSppRows ?? []).map(
          (r) => (r as { status: string }).status,
        );
        const allPublished =
          sppStatuses.length > 0 && sppStatuses.every((s) => s === 'published');
        const anyFailed = sppStatuses.some((s) => s === 'failed');

        // RETRY POLICY: when at least one leg failed and we still have
        // retries left, re-queue the post for another publish attempt
        // RETRY_DELAY_MS from now. Already-published legs are protected by
        // the per-leg filter at the top of the loop. Only flip to terminal
        // 'partially_failed' once retries are exhausted (the team can still
        // retry manually after that, but the cron stops auto-trying).
        const currentRetryCount = (post.retry_count ?? 0) as number;
        const retriesRemaining = currentRetryCount + 1 < MAX_RETRIES;

        let newStatus: 'published' | 'partially_failed' | 'scheduled';
        let updatePayload: Record<string, unknown>;
        if (allPublished) {
          newStatus = 'published';
          updatePayload = {
            status: 'published',
            late_post_id: result.externalPostId,
            published_at: new Date().toISOString(),
            failure_reason: null,
            // Clear the dedup stamps so a future failure / stuck on this
            // row can re-page.
            failure_notification_sent_at: null,
            stuck_publishing_alerted_at: null,
            updated_at: new Date().toISOString(),
          };
        } else if (anyFailed && retriesRemaining) {
          // Auto-retry partial failure in 30 min. Bump retry_count and push
          // scheduled_at so the SELECT below picks it up on the next eligible
          // cron tick. Stay in 'partially_failed' so the per-leg filter
          // protects the legs that already shipped.
          newStatus = 'partially_failed';
          updatePayload = {
            status: 'partially_failed',
            late_post_id: result.externalPostId,
            retry_count: currentRetryCount + 1,
            scheduled_at: new Date(Date.now() + RETRY_DELAY_MS).toISOString(),
            // Gap 4: include per-platform reason text. Prior version
            // emitted only the platform names, so the admin UI showed
            // "Auto-retry in 30 min: tiktok, linkedin failed" with no
            // hint at why — operators had to dig into Zernio dashboards.
            failure_reason: failedPlatformDetails.length
              ? `Auto-retry in 30 min: ${failedPlatformDetails.map((f) => `${f.platform}: ${f.reason ?? 'unknown error'}`).join(' | ')}`
              : null,
            updated_at: new Date().toISOString(),
          };
        } else if (anyFailed) {
          // Retries exhausted — terminal partial failure.
          newStatus = 'partially_failed';
          updatePayload = {
            status: 'partially_failed',
            late_post_id: result.externalPostId,
            retry_count: currentRetryCount + 1,
            failure_reason: failedPlatformDetails.length
              ? `${failedPlatformDetails.map((f) => `${f.platform}: ${f.reason ?? 'unknown error'}`).join(' | ')} (after ${MAX_RETRIES} attempts)`
              : null,
            updated_at: new Date().toISOString(),
          };
        } else {
          // No failures, but not every leg is 'published' yet (some 'pending'
          // — Zernio queued them but the platform hasn't confirmed). Treat
          // as published; verify-post sweep + Zernio webhooks reconcile the
          // pending legs once they confirm.
          newStatus = 'published';
          updatePayload = {
            status: 'published',
            late_post_id: result.externalPostId,
            published_at: new Date().toISOString(),
            failure_reason: null,
            // Clear the dedup stamps so a future failure / stuck on this
            // row can re-page.
            failure_notification_sent_at: null,
            stuck_publishing_alerted_at: null,
            updated_at: new Date().toISOString(),
          };
        }

        await adminClient
          .from('scheduled_posts')
          .update(updatePayload)
          .eq('id', post.id);

        // Audit-log this late_post_id assignment so post-rotation webhooks
        // still resolve to the right parent and forensics can replay attempts.
        if (Object.prototype.hasOwnProperty.call(updatePayload, 'late_post_id')) {
          const next = (updatePayload as { late_post_id?: string | null }).late_post_id ?? null;
          await recordLatePostIdChange(adminClient, post.id, next);
        }

        // PARTIAL-FAILURE NOTIFICATION
        //
        // Only fire when retries are EXHAUSTED. Auto-retries in flight don't
        // need to wake anyone up — most transient platform errors clear in
        // 30 min. If we still have retries left, the failed legs will get
        // another shot before the team is paged. Once retries are spent
        // and at least one leg is still failed, ping ops so Jack can
        // intervene.
        if (newStatus === 'partially_failed' && !retriesRemaining && failedPlatformDetails.length > 0) {
          try {
            await notifyPartialFailureGuarded(
              adminClient,
              post,
              failedPlatformDetails,
              sendPartialFailureNotification,
            );
          } catch (notifyErr) {
            console.error('Failed to send partial-failure notification:', notifyErr);
          }
        }

        publishedCount++;
      } catch (err) {
        console.error(`Failed to publish post ${post.id}:`, err);

        // Global Zernio auth failure (401/403). The post-level call itself
        // was rejected, which on Zernio's API means our API key is bad —
        // not a per-leg account issue. Notify Jack directly; per-leg
        // disconnect handling above doesn't fire because the platforms
        // array never came back.
        if (isZernioGlobalAuthError(err)) {
          try {
            await notifyAdmins({
              type: 'pipeline_alert',
              title: 'Zernio API key rejected',
              body: `Zernio returned ${err.status} during publishPost. Rotate ZERNIO_API_KEY and redeploy.`,
              linkPath: '/admin/scheduler',
            });
          } catch (notifyErr) {
            console.error('Failed to send Zernio API-key alert:', notifyErr);
          }
        }

        // Gap 6/A10: terminal-error short-circuit. A subset of error messages
        // signal "this will never succeed without operator intervention" —
        // retrying just delays the user-facing failure email and burns
        // retry budget. When we see one, jump straight to MAX_RETRIES so
        // the next branch flips status='failed' and emails the team.
        const errMsg = err instanceof Error ? err.message : String(err);
        const isTerminal =
          /Mux asset errored/i.test(errMsg) ||
          /Re-upload the video/i.test(errMsg) ||
          isZernioGlobalAuthError(err);
        const newRetryCount = isTerminal ? MAX_RETRIES : (post.retry_count ?? 0) + 1;
        const newStatus = newRetryCount >= MAX_RETRIES ? 'failed' : 'scheduled';

        await adminClient
          .from('scheduled_posts')
          .update({
            status: newStatus,
            retry_count: newRetryCount,
            failure_reason: err instanceof Error ? err.message : 'Unknown error',
            // Fixed 30 min delay between retries (RETRY_DELAY_MS). Earlier
            // we used exponential backoff (2/4/8 min) which retried into
            // active rate limits faster than the upstream cleared them.
            scheduled_at: newStatus === 'scheduled'
              ? new Date(Date.now() + RETRY_DELAY_MS).toISOString()
              : post.scheduled_at,
            updated_at: new Date().toISOString(),
          })
          .eq('id', post.id);

        failedCount++;

        // If all retries exhausted, send failure email
        if (newRetryCount >= MAX_RETRIES) {
          try {
            await sendFailureNotification(adminClient, post);
          } catch (emailErr) {
            console.error('Failed to send failure notification:', emailErr);
          }
        }
      }
    }

    // PUB-01: one chat card per affected client for every leg whose
    // token came back dead at publish time during this cron run. The
    // `disconnect_alerted_at` stamp inside the loop already dedups
    // against the daily watcher, so this fires at most once per client
    // per expiry incident.
    let tokenDeadAlerted = 0;
    if (tokenDeadCandidates.length > 0) {
      try {
        const { alerted } = await notifyConnectionExpired(
          adminClient,
          tokenDeadCandidates,
          'publish-posts:token-dead-at-publish',
        );
        tokenDeadAlerted = alerted;
      } catch (notifyErr) {
        console.error(
          '[publish-cron] token-dead-at-publish notify failed:',
          notifyErr,
        );
      }
    }

    // APPROVED-DRAFT RECOVERY SWEEP
    //
    // The share-link comment route calls `publishScheduledPost` inline when
    // a comment lands as 'approved'. If that call fails (deploy timing,
    // function timeout, transient Zernio error) the post sits in 'draft'
    // forever even though the client said "ship it." This sweep finds drop
    // posts in 'draft' that have at least one 'approved' review comment and
    // re-runs `publishScheduledPost`. The function is idempotent, so
    // double-firing is safe. We only touch drop posts (rows linked from
    // `content_drop_videos`) so non-drop drafts stay untouched.
    let recoveredCount = 0;
    let recoveryFailedCount = 0;
    let reconciledCount = 0;
    try {
      // Find every drop post that's in 'draft', then check approval state.
      const { data: draftPosts } = await adminClient
        .from('scheduled_posts')
        .select('id')
        .eq('status', 'draft');

      const draftIds = (draftPosts ?? []).map((r) => (r as { id: string }).id);

      if (draftIds.length > 0) {
        // Restrict to drop posts.
        const { data: dropRows } = await adminClient
          .from('content_drop_videos')
          .select('scheduled_post_id')
          .in('scheduled_post_id', draftIds);
        const dropDraftIdList = (dropRows ?? []).map(
          (r) => (r as { scheduled_post_id: string }).scheduled_post_id,
        );

        if (dropDraftIdList.length > 0) {
          // Find which of those have an approved review comment.
          const { data: reviewLinks } = await adminClient
            .from('post_review_links')
            .select('id, post_id')
            .in('post_id', dropDraftIdList);
          const linkIdToPostId = new Map<string, string>();
          for (const r of reviewLinks ?? []) {
            linkIdToPostId.set(
              (r as { id: string; post_id: string }).id,
              (r as { id: string; post_id: string }).post_id,
            );
          }

          const approvedPostIds = new Set<string>();
          if (linkIdToPostId.size > 0) {
            const { data: approvedComments } = await adminClient
              .from('post_review_comments')
              .select('review_link_id')
              .in('review_link_id', Array.from(linkIdToPostId.keys()))
              .eq('status', 'approved');
            for (const c of approvedComments ?? []) {
              const postId = linkIdToPostId.get(
                (c as { review_link_id: string }).review_link_id,
              );
              if (postId) approvedPostIds.add(postId);
            }
          }

          for (const postId of approvedPostIds) {
            try {
              const result = await publishScheduledPost(adminClient, postId);
              if (!result.alreadyPublished) {
                recoveredCount++;
                console.log(`[publish-cron] recovered approved draft ${postId} → Zernio ${result.externalPostId}`);
              }
            } catch (err) {
              recoveryFailedCount++;
              const reason = err instanceof Error ? err.message : String(err);
              console.error(`[publish-cron] failed to recover approved draft ${postId}:`, err);
              // Stamp `failure_reason` so the admin scheduler UI surfaces the
              // real publish-blocker (e.g. hashtag overflow). The post stays
              // in 'draft', so future cron runs will retry it once the data
              // issue is fixed.
              await adminClient
                .from('scheduled_posts')
                .update({
                  failure_reason: `Recovery: ${reason.substring(0, 400)}`,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', postId);
            }
          }
        }
      }
    } catch (recoverErr) {
      console.error('[publish-cron] approved-draft recovery sweep failed:', recoverErr);
    }

    // RECONCILE TIMEOUT FALSE-FAILS
    //
    // Zernio's publishPost wait-window can lapse before the platform
    // (FB/TikTok/etc.) confirms acceptance. The leg gets marked failed with
    // "Publishing timed out during platform API call. The post may have been
    // published externally." but the platform actually did accept the post.
    // We re-poll Zernio's authoritative GET /posts/{id} and flip those legs
    // back to 'published'. Only acts on rows whose failure_reason matches a
    // timeout pattern; real failures are left alone. Only flips failed →
    // published, never the reverse.
    //
    // Window is 7 days: the previous 24h cap meant any leg the cron didn't
    // get to within a day fell out of view forever (the
    // `scripts/reconcile-stale-timeouts.ts` backfill exists exactly for that
    // reason). 7 days is wide enough that Zernio's authoritative state has
    // settled on every platform, and the limit caps cost on the hot path.
    try {
      const cutoffIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: reconcileCandidates } = await adminClient
        .from('scheduled_posts')
        .select('id')
        .in('status', ['partially_failed', 'failed'])
        .gte('updated_at', cutoffIso)
        .not('late_post_id', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(25);

      for (const c of reconcileCandidates ?? []) {
        const candidateId = (c as { id: string }).id;
        try {
          const result = await verifyAndReconcilePost(adminClient, candidateId);
          if (result.reconciledPlatforms > 0) {
            reconciledCount++;
            console.log(
              `[publish-cron] reconciled ${result.reconciledPlatforms} timeout(s) on ${candidateId}; new status=${result.newPostStatus}`,
            );
          }
        } catch (err) {
          console.error(`[publish-cron] reconcile failed for ${candidateId}:`, err);
        }
      }
    } catch (reconcileErr) {
      console.error('[publish-cron] reconcile sweep failed:', reconcileErr);
    }

    // STALE-DRAFT SCAN
    //
    // Drop posts whose scheduled_at has passed but never got an approval
    // comment will sit in 'draft' forever. The cron's publish loop never
    // touches draft rows, so we'd silently miss the post date with no
    // signal to anyone. Per Jack's invariant: unapproved posts MUST NEVER
    // publish, but they SHOULD ping us so we can chase the client for
    // approval (or pull the post). We notify once per stale draft (dedup
    // by stamping `failure_reason`) and leave the row in 'draft' so it
    // can still be approved → published if the client comes through late.
    try {
      const nowIso = new Date().toISOString();
      const { data: staleCandidates } = await adminClient
        .from('scheduled_posts')
        .select('id, client_id, caption, title, scheduled_at, failure_reason')
        .eq('status', 'draft')
        .lt('scheduled_at', nowIso)
        .limit(50);

      const candidates = (staleCandidates ?? []).filter((p) => {
        const reason = (p as { failure_reason: string | null }).failure_reason;
        return !reason || !reason.startsWith(STALE_ALERT_PREFIX);
      });

      if (candidates.length > 0) {
        const candidateIds = candidates.map((p) => (p as { id: string }).id);
        const { data: dropRows } = await adminClient
          .from('content_drop_videos')
          .select('scheduled_post_id, drop_id')
          .in('scheduled_post_id', candidateIds);
        const postIdToDropId = new Map<string, string>();
        for (const r of dropRows ?? []) {
          const row = r as { scheduled_post_id: string; drop_id: string };
          postIdToDropId.set(row.scheduled_post_id, row.drop_id);
        }
        const dropPostIds = new Set(postIdToDropId.keys());

        const staleDropPostsAll = candidates.filter((p) =>
          dropPostIds.has((p as { id: string }).id),
        );

        // Skip drop posts that already have an approved review comment.
        // Those are recovery-sweep candidates that haven't transitioned yet
        // (e.g. transient publish error); don't false-alarm Jack as if the
        // client never approved.
        let staleDropPosts = staleDropPostsAll;
        if (staleDropPostsAll.length > 0) {
          const staleIds = staleDropPostsAll.map(
            (p) => (p as { id: string }).id,
          );
          const { data: linkRows } = await adminClient
            .from('post_review_links')
            .select('id, post_id')
            .in('post_id', staleIds);
          const linkIdToPostId = new Map<string, string>();
          for (const r of linkRows ?? []) {
            linkIdToPostId.set(
              (r as { id: string; post_id: string }).id,
              (r as { id: string; post_id: string }).post_id,
            );
          }
          const approvedPostIds = new Set<string>();
          if (linkIdToPostId.size > 0) {
            const { data: approvedComments } = await adminClient
              .from('post_review_comments')
              .select('review_link_id')
              .in('review_link_id', Array.from(linkIdToPostId.keys()))
              .eq('status', 'approved');
            for (const c of approvedComments ?? []) {
              const postId = linkIdToPostId.get(
                (c as { review_link_id: string }).review_link_id,
              );
              if (postId) approvedPostIds.add(postId);
            }
          }
          staleDropPosts = staleDropPostsAll.filter(
            (p) => !approvedPostIds.has((p as { id: string }).id),
          );
        }

        // Batch-enrich the alert body. We resolve client name, target
        // platforms, and assigned strategist up front so notifyAdmins gets
        // a single rich description per post instead of "scheduled for X,
        // caption Y" with no ownership context.
        const stalePostIds = staleDropPosts.map((p) => (p as { id: string }).id);
        const clientIds = Array.from(
          new Set(
            staleDropPosts
              .map((p) => (p as { client_id: string | null }).client_id)
              .filter((id): id is string => Boolean(id)),
          ),
        );
        const dropIds = Array.from(
          new Set(
            stalePostIds
              .map((id) => postIdToDropId.get(id))
              .filter((id): id is string => Boolean(id)),
          ),
        );

        const [clientRowsRes, dropRowsRes, platformRowsRes] = await Promise.all([
          clientIds.length > 0
            ? adminClient.from('clients').select('id, name').in('id', clientIds)
            : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
          dropIds.length > 0
            ? adminClient
                .from('content_drops')
                .select('id, strategist_id')
                .in('id', dropIds)
            : Promise.resolve({
                data: [] as Array<{ id: string; strategist_id: string | null }>,
              }),
          stalePostIds.length > 0
            ? adminClient
                .from('scheduled_post_platforms')
                .select('post_id, social_profiles!inner(platform)')
                .in('post_id', stalePostIds)
            : Promise.resolve({ data: [] as Array<unknown> }),
        ]);

        const clientNameById = new Map<string, string>();
        for (const c of (clientRowsRes.data ?? []) as Array<{ id: string; name: string }>) {
          clientNameById.set(c.id, c.name);
        }

        const dropToStrategist = new Map<string, string | null>();
        for (const d of (dropRowsRes.data ?? []) as Array<{
          id: string;
          strategist_id: string | null;
        }>) {
          dropToStrategist.set(d.id, d.strategist_id);
        }

        const strategistIds = Array.from(
          new Set(
            Array.from(dropToStrategist.values()).filter(
              (id): id is string => Boolean(id),
            ),
          ),
        );
        const strategistNameById = new Map<string, string>();
        if (strategistIds.length > 0) {
          const { data: tmRows } = await adminClient
            .from('team_members')
            .select('id, full_name, email')
            .in('id', strategistIds);
          for (const tm of (tmRows ?? []) as Array<{
            id: string;
            full_name: string | null;
            email: string | null;
          }>) {
            strategistNameById.set(
              tm.id,
              tm.full_name?.trim() || tm.email?.trim() || 'Unknown',
            );
          }
        }

        const platformsByPost = new Map<string, Set<string>>();
        for (const r of (platformRowsRes.data ?? []) as Array<{
          post_id: string;
          social_profiles: { platform: string } | { platform: string }[] | null;
        }>) {
          const sp = r.social_profiles;
          // Supabase returns the joined row as either an object or array
          // depending on cardinality declarations; normalize.
          const platform = Array.isArray(sp) ? sp[0]?.platform : sp?.platform;
          if (!platform) continue;
          const set = platformsByPost.get(r.post_id) ?? new Set<string>();
          set.add(platform);
          platformsByPost.set(r.post_id, set);
        }

        const formatPlatform = (p: string) =>
          p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();

        for (const post of staleDropPosts) {
          const row = post as {
            id: string;
            client_id: string;
            caption: string | null;
            title: string | null;
            scheduled_at: string;
          };
          const clientName = clientNameById.get(row.client_id) ?? 'Unknown client';
          const dropId = postIdToDropId.get(row.id) ?? null;
          const strategistId = dropId ? dropToStrategist.get(dropId) ?? null : null;
          const strategistName = strategistId
            ? strategistNameById.get(strategistId) ?? null
            : null;
          const platformSet = platformsByPost.get(row.id);
          const platformList = platformSet
            ? Array.from(platformSet).map(formatPlatform).sort().join(', ')
            : '';
          const headline = (row.title ?? row.caption ?? '').trim();
          const headlineSnippet = headline.length > 90
            ? `${headline.substring(0, 90)}...`
            : headline;
          const scheduledFormatted = new Date(row.scheduled_at).toLocaleString(
            'en-US',
            { dateStyle: 'medium', timeStyle: 'short' },
          );

          const bodyLines: string[] = [];
          if (headlineSnippet) bodyLines.push(`"${headlineSnippet}"`);
          const meta: string[] = [`Scheduled ${scheduledFormatted}`];
          if (platformList) meta.push(platformList);
          if (strategistName) meta.push(`Strategist: ${strategistName}`);
          bodyLines.push(meta.join(' · '));
          bodyLines.push('Still in draft, no approval comment received.');
          const body = bodyLines.join('\n');

          try {
            const linkPath = await resolveFailureLinkPath(adminClient, row.id);
            await notifyAdmins({
              type: 'post_needs_approval',
              title: `Past due without approval: ${clientName}`,
              body,
              linkPath,
              clientId: row.client_id,
            });
            await adminClient
              .from('scheduled_posts')
              .update({
                failure_reason: `${STALE_ALERT_PREFIX} (alerted ${nowIso})`,
                updated_at: new Date().toISOString(),
              })
              .eq('id', row.id);
            staleAlertedCount++;
          } catch (notifyErr) {
            console.error(
              `[publish-cron] failed to alert on stale draft ${row.id}:`,
              notifyErr,
            );
          }
        }
      }
    } catch (scanErr) {
      console.error('[publish-cron] stale-draft scan failed:', scanErr);
    }

    return NextResponse.json({
      message: `Processed ${pendingPosts?.length ?? 0} posts`,
      published: publishedCount,
      failed: failedCount,
      recovered_approved: recoveredCount,
      recovery_failed: recoveryFailedCount,
      reconciled: reconciledCount,
      stale_alerted: staleAlertedCount,
      token_dead_at_publish: tokenDeadCandidates.length,
      token_dead_alerted: tokenDeadAlerted,
    });
  } catch (error) {
    console.error('POST /api/cron/publish-posts error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withCronTelemetry({ route: '/api/cron/publish-posts' }, handleGet);

async function resolveFailureLinkPath(
  adminClient: ReturnType<typeof createAdminClient>,
  postId: string,
): Promise<string> {
  const { data: dropVideo } = await adminClient
    .from('content_drop_videos')
    .select('drop_id')
    .eq('scheduled_post_id', postId)
    .maybeSingle();
  const dropId = (dropVideo as { drop_id?: string } | null)?.drop_id ?? null;
  if (dropId) return `/admin/calendar/${dropId}`;
  return `/admin/scheduler?post=${postId}`;
}

async function sendFailureNotification(
  adminClient: ReturnType<typeof createAdminClient>,
  post: Record<string, unknown>
) {
  const postId = post.id as string;
  const clientId = post.client_id as string | null;

  const { data: client } = clientId
    ? await adminClient.from('clients').select('name').eq('id', clientId).single()
    : { data: null };
  const clientName = client?.name ?? 'Unknown client';

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const linkPath = await resolveFailureLinkPath(adminClient, postId);
  const postUrl = `${appUrl}${linkPath}`;
  const caption = ((post.caption as string) ?? '').substring(0, 100);

  // In-app bell: ping the assigned admins + owners. Previously only the
  // creator was notified, which meant Jack missed teammates' failures.
  await notifyAdmins({
    type: 'post_failed',
    title: `Post failed to publish for ${clientName}`,
    body: `Failed after 3 retries: "${caption}${((post.caption as string) ?? '').length > 100 ? '…' : ''}"`,
    linkPath,
    clientId: clientId ?? undefined,
  });

  const opsWebhook = process.env.OPS_CHAT_WEBHOOK_URL ?? null;
  if (opsWebhook) {
    const reason = (post.failure_reason as string | null) ?? 'unknown error';
    const truncatedReason = reason.length > 280 ? reason.substring(0, 280) + '…' : reason;
    const captionTrunc = `${caption}${((post.caption as string) ?? '').length > 100 ? '…' : ''}`;
    postToGoogleChatSafe(
      opsWebhook,
      buildChatCard({
        cardId: `publish-failure-${postId}`,
        headerTitle: '🚨 Publish FAILED (3 retries)',
        headerSubtitle: clientName,
        sections: [
          {
            widgets: [
              {
                type: 'text',
                text: 'Failed on every platform after 3 retries. The client was <b>not</b> notified; the post is stuck in failed state.',
              },
              { type: 'kv', label: 'Caption', value: captionTrunc },
              { type: 'kv', label: 'Reason', value: truncatedReason },
              { type: 'button', text: 'Investigate', url: postUrl, filled: true },
            ],
          },
        ],
        fallbackText: `🚨 Publish FAILED for ${clientName}: ${truncatedReason}. ${postUrl}`,
      }),
      `publish-failure ${postId}`,
    );
  }

  console.log(`[PUBLISH FAILURE] postId=${postId} clientId=${clientId} reason=${post.failure_reason}`);
}

/**
 * Partial-failure notification.
 *
 * Fires when a post resolves to `partially_failed` — at least one platform
 * shipped but at least one failed. The cron does NOT retry partial failures
 * (the published platforms can't be unpublished, so re-running would dupe
 * the successes), so without this hook the team gets zero signal that, e.g.,
 * 4/5 platforms didn't post. Mirrors `sendFailureNotification`: in-app row
 * for the creator + ops-channel Google Chat ping listing the failed legs.
 */
async function sendPartialFailureNotification(
  adminClient: ReturnType<typeof createAdminClient>,
  post: Record<string, unknown>,
  failures: { platform: string; username: string | null; reason: string }[],
) {
  const postId = post.id as string;
  const clientId = post.client_id as string | null;

  const { data: client } = clientId
    ? await adminClient.from('clients').select('name').eq('id', clientId).single()
    : { data: null };
  const clientName = client?.name ?? 'Unknown client';

  const caption = ((post.caption as string) ?? '').substring(0, 100);
  const linkPath = await resolveFailureLinkPath(adminClient, postId);

  const platformList = failures
    .map((f) => (f.username ? `${f.platform} (@${f.username})` : f.platform))
    .join(', ');

  await notifyAdmins({
    type: 'post_failed',
    title: `Post partially failed to publish for ${clientName}`,
    body: `${platformList} did not publish: "${caption}${((post.caption as string) ?? '').length > 100 ? '…' : ''}"`,
    linkPath,
    clientId: clientId ?? undefined,
  });

  const opsWebhook = process.env.OPS_CHAT_WEBHOOK_URL ?? null;
  if (opsWebhook) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const postUrl = `${appUrl}${linkPath}`;
    const failureLines = failures
      .map((f) => {
        const who = f.username ? `${f.platform} (@${f.username})` : f.platform;
        const reason = f.reason.length > 200 ? f.reason.substring(0, 200) + '…' : f.reason;
        return `• ${who}: ${reason}`;
      })
      .join('<br>');
    const captionTrunc = `${caption}${((post.caption as string) ?? '').length > 100 ? '…' : ''}`;
    postToGoogleChatSafe(
      opsWebhook,
      buildChatCard({
        cardId: `publish-partial-${postId}`,
        headerTitle: '⚠️ Publish PARTIALLY failed',
        headerSubtitle: clientName,
        sections: [
          {
            widgets: [
              {
                type: 'text',
                text: 'Some platforms shipped, some did not. Cron will <b>not</b> retry partials (the successes can\'t be unpublished). The client was <b>not</b> notified.',
              },
              { type: 'kv', label: 'Caption', value: captionTrunc },
              { type: 'kv', label: 'Failed legs', value: failureLines },
              { type: 'button', text: 'Manually re-publish failed legs', url: postUrl, filled: true },
            ],
          },
        ],
        fallbackText: `⚠️ Publish partially failed for ${clientName}. ${postUrl}`,
      }),
      `publish-partial ${postId}`,
    );
  }

  console.log(
    `[PUBLISH PARTIAL] postId=${postId} clientId=${clientId} failed=${failures.length}`,
  );
}
