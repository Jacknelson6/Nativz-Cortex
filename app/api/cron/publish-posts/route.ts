import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPostingService } from '@/lib/posting';
import type { SocialPlatform } from '@/lib/posting/types';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';
import { notifyAdmins } from '@/lib/notifications';
import { publishScheduledPost } from '@/lib/calendar/schedule-drop';

const STALE_ALERT_PREFIX = 'Stale draft: scheduled time passed without approval';

export const maxDuration = 300;

const MAX_RETRIES = 3;
const BATCH_SIZE = 5;

/**
 * GET /api/cron/publish-posts
 *
 * Vercel cron job (every 2 minutes): publish scheduled posts that are due. Processes up to
 * 5 posts per run. Implements exponential backoff retry (up to 3 attempts). Sends an in-app
 * failure notification when all retries are exhausted. Requires CRON_SECRET bearer token.
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
            late_account_id
          )
        ),
        scheduled_post_media (
          scheduler_media (
            storage_path,
            thumbnail_url
          )
        )
      `)
      .in('status', ['scheduled', 'publishing'])
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

    // Note: don't early-return on empty pendingPosts — we still need to
    // run the stale-draft scan below.

    for (const post of pendingPosts ?? []) {
      try {
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

        // Resolve which video URL to publish.
        //
        // The original cut sits in Supabase Storage (`scheduler-media`
        // bucket, addressed via `scheduler_media.storage_path`). Revised cuts
        // live in Mux only — uploaded by the client through the share-link
        // revision flow, which writes to `content_drop_videos.revised_*`.
        //
        // Three cases:
        //   1. No revision row, or revision never uploaded → publish the
        //      original from Storage (legacy behaviour).
        //   2. Revision uploaded AND the Mux MP4 rendition has landed
        //      (`revised_mp4_url` is non-null) → publish the revision MP4.
        //      Zernio/Late ingest can't read HLS manifests, so we MUST use
        //      the static MP4 URL, not the .m3u8 in `revised_video_url`.
        //   3. Revision uploaded but MP4 rendition still rendering
        //      (`revised_mp4_url` is null) → throw, which bumps retry_count
        //      and re-queues with exponential backoff. Mux's capped-1080p
        //      pack typically lands within ~1 min of upload, so 3 retries
        //      (2/4/8 min) covers it. We MUST NOT silently fall back to the
        //      original — that's the bug that shipped unrevised content live.
        const { data: revisionRow } = await adminClient
          .from('content_drop_videos')
          .select('revised_mp4_url, revised_video_uploaded_at')
          .eq('scheduled_post_id', post.id)
          .maybeSingle();
        const revisionUploaded = revisionRow?.revised_video_uploaded_at != null;
        const revisionReady = revisionRow?.revised_mp4_url != null;
        if (revisionUploaded && !revisionReady) {
          throw new Error(
            'Revision pending: Mux MP4 rendition not ready yet. Cron will retry.',
          );
        }

        let videoUrl: string;
        if (revisionReady) {
          videoUrl = revisionRow!.revised_mp4_url as string;
        } else {
          const media = post.scheduled_post_media?.[0]?.scheduler_media;
          if (!media?.storage_path) {
            throw new Error('No media attached to post');
          }
          const { data: publicUrl } = adminClient.storage
            .from('scheduler-media')
            .getPublicUrl(media.storage_path);
          videoUrl = publicUrl.publicUrl;
        }

        // Build platform profile map. Zernio expects its own MongoDB
        // ObjectId (`social_profiles.late_account_id`) as the platform
        // accountId, NOT our internal UUID. Drop any spp rows whose
        // social profile hasn't been connected to Zernio yet (no
        // late_account_id) -- they'd 400 anyway. Keep an internal
        // map so we can reverse-lookup the spp row when Zernio echoes
        // accountId back in the publish response.
        type PlatformProfile = {
          profileId: string;
          lateAccountId: string;
          platform: SocialPlatform;
        };
        const platformProfiles: PlatformProfile[] = (
          post.scheduled_post_platforms ?? []
        )
          .map((spp: Record<string, unknown>): PlatformProfile | null => {
            const profile = spp.social_profiles as Record<string, unknown> | null;
            const lateAccountId = (profile?.late_account_id ?? null) as string | null;
            if (!lateAccountId) return null;
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

        // Publish via posting service.
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
        };
        const result = await postingService.publishPost({
          videoUrl,
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
        });

        // Update per-platform results
        let allPublished = true;
        let anyFailed = false;

        for (const platformResult of result.platforms) {
          // Zernio returns the late_account_id we sent it; translate
          // back to our internal UUID before matching the spp row.
          const internalProfileId =
            lateIdToProfileId[platformResult.profileId] ?? platformResult.profileId;
          const spp = (post.scheduled_post_platforms ?? []).find(
            (s: Record<string, unknown>) => s.social_profile_id === internalProfileId,
          );
          if (spp) {
            await adminClient
              .from('scheduled_post_platforms')
              .update({
                status: platformResult.status === 'published' ? 'published' : 'failed',
                external_post_id: platformResult.externalPostId ?? null,
                external_post_url: platformResult.externalPostUrl ?? null,
                failure_reason: platformResult.error ?? null,
              })
              .eq('id', (spp as Record<string, unknown>).id);
          }

          if (platformResult.status !== 'published') allPublished = false;
          if (platformResult.status === 'failed') anyFailed = true;
        }

        // Update post status
        const newStatus = allPublished
          ? 'published'
          : anyFailed
            ? 'partially_failed'
            : 'published';

        await adminClient
          .from('scheduled_posts')
          .update({
            status: newStatus,
            external_post_id: result.externalPostId,
            published_at: allPublished ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', post.id);

        publishedCount++;
      } catch (err) {
        console.error(`Failed to publish post ${post.id}:`, err);

        const newRetryCount = (post.retry_count ?? 0) + 1;
        const newStatus = newRetryCount >= MAX_RETRIES ? 'failed' : 'scheduled';

        await adminClient
          .from('scheduled_posts')
          .update({
            status: newStatus,
            retry_count: newRetryCount,
            failure_reason: err instanceof Error ? err.message : 'Unknown error',
            // Exponential backoff: retry in 2^n minutes
            scheduled_at: newStatus === 'scheduled'
              ? new Date(Date.now() + Math.pow(2, newRetryCount) * 60 * 1000).toISOString()
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
        .select('id, client_id, caption, scheduled_at, failure_reason')
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
          .select('scheduled_post_id')
          .in('scheduled_post_id', candidateIds);
        const dropPostIds = new Set(
          (dropRows ?? []).map(
            (r) => (r as { scheduled_post_id: string }).scheduled_post_id,
          ),
        );

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

        for (const post of staleDropPosts) {
          const row = post as {
            id: string;
            client_id: string;
            caption: string | null;
            scheduled_at: string;
          };
          const caption = (row.caption ?? '').substring(0, 80);
          try {
            await notifyAdmins({
              type: 'post_needs_approval',
              title: 'Drop post past due without approval',
              body: `Post scheduled for ${new Date(row.scheduled_at).toLocaleString()} is still in draft (no approval comment). Caption: "${caption}${(row.caption ?? '').length > 80 ? '...' : ''}"`,
              linkPath: `/admin/scheduling?post=${row.id}`,
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
      stale_alerted: staleAlertedCount,
    });
  } catch (error) {
    console.error('POST /api/cron/publish-posts error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withCronTelemetry({ route: '/api/cron/publish-posts' }, handleGet);

async function sendFailureNotification(
  adminClient: ReturnType<typeof createAdminClient>,
  post: Record<string, unknown>
) {
  // Get creator's email
  const createdBy = post.created_by as string | null;
  if (!createdBy) return;

  const { data: creator } = await adminClient
    .from('users')
    .select('email, full_name')
    .eq('id', createdBy)
    .single();

  if (!creator?.email) return;

  // Get client name
  const { data: client } = await adminClient
    .from('clients')
    .select('name')
    .eq('id', post.client_id)
    .single();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const postUrl = `${appUrl}/admin/scheduling?post=${post.id}`;
  const caption = ((post.caption as string) ?? '').substring(0, 100);

  // Create in-app notification
  await adminClient.from('notifications').insert({
    recipient_user_id: createdBy,
    organization_id: null,
    type: 'report_published', // Reusing existing type for now
    title: `Post failed to publish`,
    body: `Post for ${client?.name ?? 'Unknown client'} failed after 3 retries: "${caption}..."`,
    link_path: `/admin/scheduling?post=${post.id}`,
    is_read: false,
    email_sent: false,
  });

  // TODO: Send actual email via Resend/SendGrid when email service is configured
  console.log(`[PUBLISH FAILURE] userId=${post.created_by} postId=${post.id} clientId=${post.client_id} reason=${post.failure_reason}`);
}
