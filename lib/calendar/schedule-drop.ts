import type { SupabaseClient } from '@supabase/supabase-js';
import { getPostingService, type SocialPlatform } from '@/lib/posting';
import type { CaptionVariants } from '@/lib/types/calendar';
import { distributeSlots } from './distribute-slots';
import { verifyAndReconcilePost } from './verify-post';
import { resolveScheduledPostMedia } from './resolve-media';
import { preflightInstagramAspectForPost } from '@/lib/posting/validate-image-aspect';
import {
  isAccountLevelLegError,
  markProfileDisconnectedFromLegFailure,
} from '@/lib/posting/zernio-account-errors';
import { getMux } from '@/lib/mux/client';

interface ScheduleInput {
  dropId: string;
  includedVideoIds?: string[];
  overrides?: Record<string, string>;
  // Restrict scheduling to a subset of the brand's connected platforms.
  platforms?: SocialPlatform[];
  // When true, posts are inserted with status='draft' and NOT queued in Zernio.
  // Used by the share-link approval flow — the client must approve each video
  // before we hand the post to Zernio. Call `publishScheduledPost` per-post on
  // approval to flip draft → scheduled.
  draftMode?: boolean;
}

interface VideoRow {
  id: string;
  drop_id: string;
  video_url: string | null;
  thumbnail_url: string | null;
  draft_caption: string | null;
  draft_hashtags: string[] | null;
  caption_variants: CaptionVariants | null;
  drive_file_name: string;
  duration_seconds: number | null;
  size_bytes: number | null;
  mime_type: string | null;
  order_index: number;
  media_type: 'video' | 'image' | null;
  mux_asset_id: string | null;
  mux_playback_id: string | null;
  mux_status: string | null;
}

interface PostAssetRow {
  id: string;
  asset_url: string | null;
  thumbnail_url: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  drive_file_name: string;
  position: number;
}

interface DropRow {
  id: string;
  client_id: string;
  created_by: string;
  start_date: string;
  end_date: string;
  default_post_time: string;
  status: string;
}

interface ScheduleResult {
  scheduled: number;
  failed: number;
  errors: { videoId: string; reason: string }[];
}

export async function scheduleDrop(
  admin: SupabaseClient,
  input: ScheduleInput,
): Promise<ScheduleResult> {
  const { data: drop, error: dropErr } = await admin
    .from('content_drops')
    .select('id, client_id, created_by, start_date, end_date, default_post_time, status')
    .eq('id', input.dropId)
    .single();
  if (dropErr || !drop) throw new Error('Content calendar not found');
  if ((drop as DropRow).status !== 'ready') {
    throw new Error(`Content calendar status must be 'ready' to schedule (got '${(drop as DropRow).status}')`);
  }

  const { data: rows } = await admin
    .from('content_drop_videos')
    .select(
      'id, drop_id, video_url, thumbnail_url, draft_caption, draft_hashtags, caption_variants, drive_file_name, duration_seconds, size_bytes, mime_type, order_index, media_type, mux_asset_id, mux_playback_id, mux_status',
    )
    .eq('drop_id', input.dropId)
    .eq('status', 'ready')
    .order('order_index');

  let videos = (rows ?? []) as VideoRow[];
  if (input.includedVideoIds?.length) {
    const allowed = new Set(input.includedVideoIds);
    videos = videos.filter((v) => allowed.has(v.id));
  }
  if (videos.length === 0) {
    throw new Error('No ready videos to schedule');
  }

  const { data: profiles } = await admin
    .from('social_profiles')
    .select('id, platform, late_account_id, is_active')
    .eq('client_id', (drop as DropRow).client_id)
    .eq('is_active', true);

  const allLateProfiles = (profiles ?? []).filter(
    (p) => typeof p.late_account_id === 'string' && p.late_account_id.length > 0,
  ) as { id: string; platform: SocialPlatform; late_account_id: string }[];

  const platformFilter = input.platforms?.length ? new Set(input.platforms) : null;
  const lateProfiles = platformFilter
    ? allLateProfiles.filter((p) => platformFilter.has(p.platform))
    : allLateProfiles;

  if (lateProfiles.length === 0) {
    if (platformFilter && allLateProfiles.length > 0) {
      throw new Error(
        `None of the requested platforms (${[...platformFilter].join(', ')}) are connected to Zernio for this brand.`,
      );
    }
    throw new Error('No connected social profiles for this brand. Connect Zernio profiles first.');
  }

  const computed = distributeSlots({
    count: videos.length,
    startDate: (drop as DropRow).start_date,
    endDate: (drop as DropRow).end_date,
    defaultTime: (drop as DropRow).default_post_time,
  });

  const slots: { video: VideoRow; scheduledAt: string }[] = videos.map((v, idx) => ({
    video: v,
    scheduledAt: input.overrides?.[v.id] ?? computed[idx],
  }));

  const result: ScheduleResult = { scheduled: 0, failed: 0, errors: [] };

  for (const slot of slots) {
    const video = slot.video;
    try {
      if (!video.draft_caption) throw new Error('Draft caption missing');

      const isImage = video.media_type === 'image';

      // Resolve the media payload. Video posts use the legacy single-file
      // path (video_url on content_drop_videos). Image posts pull all
      // assets from content_drop_post_assets ordered by position.
      let mediaInserts: {
        filename: string;
        storage_path: string;
        thumbnail_url: string | null;
        duration_seconds: number | null;
        file_size_bytes: number | null;
        mime_type: string | null;
        late_media_url: string;
      }[];
      let postType: 'reel' | 'image' | 'carousel';
      let coverImageUrl: string | null;

      if (isImage) {
        const { data: assets } = await admin
          .from('content_drop_post_assets')
          .select('id, asset_url, thumbnail_url, mime_type, size_bytes, drive_file_name, position')
          .eq('drop_video_id', video.id)
          .eq('status', 'ready')
          .order('position', { ascending: true });
        const assetRows = ((assets ?? []) as PostAssetRow[]).filter((a) => a.asset_url);
        if (assetRows.length === 0) throw new Error('No ready image assets to schedule');
        mediaInserts = assetRows.map((a) => ({
          filename: a.drive_file_name,
          storage_path: a.asset_url as string,
          thumbnail_url: a.thumbnail_url ?? a.asset_url,
          duration_seconds: null,
          file_size_bytes: a.size_bytes,
          mime_type: a.mime_type,
          late_media_url: a.asset_url as string,
        }));
        postType = assetRows.length > 1 ? 'carousel' : 'image';
        coverImageUrl = assetRows[0].asset_url ?? null;
      } else {
        if (!video.video_url) throw new Error('Video URL missing');
        // PRODUCER MUX INGESTION
        //
        // Push the original video into Mux at scheduling time so the publish-
        // time payload ships from Mux (our paid hosting) instead of Supabase
        // storage (egress costs + slower CDN). Mux pulls from `video.video_url`
        // (already a fully-qualified public Supabase URL from
        // `uploadVideoBytes`) so no extra signed-URL handling needed.
        //
        // The `capped-1080p.mp4` rendition lands ~1-5 min later via the
        // `static_renditions.ready` webhook, which stamps `revised_mp4_url`
        // (field reused for originals + revisions). Until then,
        // `resolveScheduledPostMedia` throws "MP4 not ready" and the cron
        // retries naturally. Idempotent — `ensureMuxAssetForVideo` short-
        // circuits when `mux_playback_id` is already set, so re-scheduling
        // doesn't duplicate ingestions.
        //
        // We KEEP the Supabase URL in `scheduler_media.late_media_url` as a
        // legacy fallback. The resolver prioritises Mux but uses scheduler_media
        // when no `mux_playback_id` is present, which protects rows from
        // before this producer change shipped.
        const playbackId = await ensureMuxAssetForVideo(admin, video);
        const muxMp4Url = `https://stream.mux.com/${playbackId}/capped-1080p.mp4`;
        mediaInserts = [{
          filename: video.drive_file_name,
          storage_path: muxMp4Url,
          thumbnail_url: video.thumbnail_url,
          duration_seconds: video.duration_seconds,
          file_size_bytes: video.size_bytes,
          mime_type: video.mime_type,
          late_media_url: muxMp4Url,
        }];
        postType = 'reel';
        coverImageUrl = video.thumbnail_url;
      }

      const { data: insertedMedia, error: mediaErr } = await admin
        .from('scheduler_media')
        .insert(
          mediaInserts.map((m) => ({
            client_id: (drop as DropRow).client_id,
            uploaded_by: (drop as DropRow).created_by,
            ...m,
            is_used: true,
          })),
        )
        .select('id, late_media_url');
      if (mediaErr || !insertedMedia) throw new Error(mediaErr?.message ?? 'Failed to insert media');

      // Always insert as 'draft' first. `publishScheduledPost` is the only
      // function that should ever flip a post to 'scheduled', and it requires
      // status='draft' as its precondition. Inserting directly as 'scheduled'
      // (the previous behaviour when draftMode was false) defeated the
      // immediate publishScheduledPost call below: it returned early because
      // status !== 'draft', so late_post_id never got stamped and the post
      // sat in the queue waiting for the cron to publish it without ever
      // having been routed through Zernio. That was the root cause of the
      // unapproved-posts-going-live incident.
      const { data: post, error: postErr } = await admin
        .from('scheduled_posts')
        .insert({
          client_id: (drop as DropRow).client_id,
          created_by: (drop as DropRow).created_by,
          caption: video.draft_caption,
          hashtags: video.draft_hashtags ?? [],
          scheduled_at: slot.scheduledAt,
          status: 'draft',
          cover_image_url: coverImageUrl,
          post_type: postType,
        })
        .select('id')
        .single();
      if (postErr || !post) throw new Error(postErr?.message ?? 'Failed to insert post');

      const platformInserts = lateProfiles.map((p) => ({
        post_id: post.id,
        social_profile_id: p.id,
        status: 'pending' as const,
      }));
      const { error: platformErr } = await admin
        .from('scheduled_post_platforms')
        .insert(platformInserts);
      if (platformErr) throw new Error(platformErr.message);

      const linkRows = insertedMedia.map((m, idx) => ({
        post_id: post.id,
        media_id: m.id as string,
        sort_order: idx,
      }));
      const { error: linkErr } = await admin
        .from('scheduled_post_media')
        .insert(linkRows);
      if (linkErr) throw new Error(linkErr.message);

      await admin
        .from('content_drop_videos')
        .update({
          scheduled_post_id: post.id,
          draft_scheduled_at: slot.scheduledAt,
        })
        .eq('id', video.id);

      // Skip Zernio publish in draft mode — `publishScheduledPost` runs later
      // when the client approves the video on the share link.
      if (!input.draftMode) {
        await publishScheduledPost(admin, post.id);
      }

      result.scheduled += 1;
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Schedule failed';
      result.failed += 1;
      result.errors.push({ videoId: video.id, reason });
      await admin
        .from('content_drop_videos')
        .update({ error_detail: reason })
        .eq('id', video.id);
    }
  }

  if (result.scheduled > 0) {
    await admin
      .from('content_drops')
      .update({
        status: 'scheduled',
        updated_at: new Date().toISOString(),
        error_detail:
          result.failed > 0 ? `${result.failed} video(s) failed to schedule` : null,
      })
      .eq('id', input.dropId);
  }

  return result;
}

/**
 * Hand a draft scheduled_posts row to Zernio. Idempotent — if already
 * scheduled (status != 'draft' or late_post_id is set), this is a no-op.
 *
 * Triggered by the share-link approval flow when the client marks a video
 * 'approved'. Re-uses everything the draft already has (caption, hashtags,
 * scheduled_at, platforms, media) — just makes the external Zernio call and
 * flips status to 'scheduled'.
 */
export async function publishScheduledPost(
  admin: SupabaseClient,
  postId: string,
): Promise<{ alreadyPublished: boolean; externalPostId?: string }> {
  const { data: post, error: postErr } = await admin
    .from('scheduled_posts')
    .select(
      'id, client_id, caption, hashtags, scheduled_at, status, late_post_id, cover_image_url, post_type, ' +
      'tagged_people, collaborator_handles, ' +
      'youtube_title, youtube_description, youtube_tags, youtube_privacy, youtube_made_for_kids, ' +
      'tiktok_allow_comment, tiktok_allow_duet, tiktok_allow_stitch, instagram_share_to_feed, ' +
      'instagram_content_type, facebook_content_type, facebook_page_id, ' +
      'linkedin_document_title, linkedin_organization_urn, linkedin_disable_link_preview, first_comment',
    )
    .eq('id', postId)
    .single<{
      id: string;
      client_id: string;
      caption: string;
      hashtags: string[] | null;
      scheduled_at: string;
      status: string;
      late_post_id: string | null;
      cover_image_url: string | null;
      post_type: string | null;
      tagged_people: string[] | null;
      collaborator_handles: string[] | null;
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
    }>();
  if (postErr || !post) throw new Error(`Post ${postId} not found`);

  if (post.late_post_id || post.status !== 'draft') {
    return { alreadyPublished: true, externalPostId: post.late_post_id ?? undefined };
  }

  // ATOMIC CLAIM — closes the race between the share-link approval handler
  // and the publish-cron approved-draft recovery sweep. Both call
  // publishScheduledPost; without this CAS the read at line 238 + the
  // status check at 267 are wide enough for both callers to pass through,
  // each fire `service.publishPost`, and each stamp `late_post_id`. The
  // second writer overwrites the first, leaving an orphan Zernio post live
  // with no DB row pointing at it.
  //
  // We try to flip 'draft' → 'publishing' atomically; only one caller wins.
  // The loser sees zero rows back and short-circuits as `alreadyPublished`.
  // The cron's hard publish path uses the same intermediate 'publishing'
  // state, so this fits the existing state machine cleanly.
  const { data: claimed } = await admin
    .from('scheduled_posts')
    .update({ status: 'publishing', updated_at: new Date().toISOString() })
    .eq('id', postId)
    .eq('status', 'draft')
    .is('late_post_id', null)
    .select('id')
    .maybeSingle();
  if (!claimed) {
    // Re-read to give the caller a useful externalPostId if the winning
    // worker has already stamped late_post_id.
    const { data: refreshed } = await admin
      .from('scheduled_posts')
      .select('late_post_id')
      .eq('id', postId)
      .maybeSingle<{ late_post_id: string | null }>();
    return {
      alreadyPublished: true,
      externalPostId: refreshed?.late_post_id ?? undefined,
    };
  }

  // Everything past the atomic CAS runs inside a guard that resets the row
  // back to 'draft' on any throw. Without it, a transient Zernio/Mux failure
  // leaves the row stuck in the intermediate 'publishing' state forever
  // (Landshark May 4: 12 image posts approved at 17:32 CDT all stuck because
  // `service.publishPost` threw, the caller logged but didn't reset, and the
  // cron's CAS only flips 'draft' → 'publishing'). Re-raise so callers
  // (share-feedback, comment, cron) keep their existing error semantics.
  try {
  // Resolve media payload via the shared Mux-aware resolver. This is the
  // critical correctness step on the approval-driven publish path: video
  // posts whose drop_video has a `revised_mp4_url` (Khen re-uploaded a
  // corrected cut) MUST ship the revised render, not the original snapshot
  // captured at scheduling time. The Weston Funding "wrong version posted"
  // incident on 2026-05-04 happened because this path used to read directly
  // from `scheduler_media.late_media_url` — the May 1 snapshot — and
  // bypassed Khen's May 3 revision entirely. The resolver throws when the
  // revision was uploaded but Mux's MP4 rendition isn't ready yet, so the
  // caller (share-link approval / cron retry) bumps retry_count instead of
  // shipping the wrong file.
  const { videoUrl, mediaItems } = await resolveScheduledPostMedia(admin, postId, post.post_type);

  // Pull the platforms this post is targeting + the brand's caption variants.
  // Keep the spp row id + social_profile_id alongside the embedded profile so
  // we can map Zernio's per-platform results (echoed back as late_account_id)
  // to the right `scheduled_post_platforms` row for status updates below.
  const { data: platforms } = await admin
    .from('scheduled_post_platforms')
    .select('id, social_profile_id, social_profiles:social_profile_id (platform, late_account_id)')
    .eq('post_id', postId);
  type SppRow = {
    id: string;
    social_profile_id: string;
    social_profiles:
      | { platform: SocialPlatform; late_account_id: string }
      | { platform: SocialPlatform; late_account_id: string }[]
      | null;
  };
  const sppRows = (platforms ?? []) as SppRow[];
  // Supabase types embedded joins as arrays; the FK is 1-to-1, so flatten.
  const flatProfiles = sppRows.flatMap((p) => {
    const sp = p.social_profiles;
    const flat = Array.isArray(sp) ? sp : sp ? [sp] : [];
    return flat.map((x) => ({ ...x, sppId: p.id, profileId: p.social_profile_id }));
  });

  // Gap 2/A1 (approval path): stamp legs whose social_profile is missing a
  // late_account_id as `failed` with a clear reason BEFORE silently filtering
  // them. The cron path used to drop these legs without a trace; the approval
  // path inherited the same bug. If a brand disconnects a profile after a
  // post is drafted, the leg now surfaces in the UI + notifications instead
  // of vanishing.
  for (const p of flatProfiles) {
    if (p.late_account_id) continue;
    const reason = `${p.platform} profile is not connected to Zernio (no late_account_id). Reconnect the profile in social settings before retrying.`;
    await admin
      .from('scheduled_post_platforms')
      .update({ status: 'failed', failure_reason: reason })
      .eq('id', p.sppId);
  }

  const lateProfiles = flatProfiles.filter(
    (p): p is { platform: SocialPlatform; late_account_id: string; sppId: string; profileId: string } =>
      !!p && typeof p === 'object' && 'late_account_id' in p && !!(p as { late_account_id: string }).late_account_id,
  );
  if (lateProfiles.length === 0) throw new Error('Draft post has no connected platforms (every leg is missing late_account_id)');

  // Gap 1: Instagram aspect-ratio preflight on the approval path.
  // The cron sweep gates IG legs on the 0.75-1.91 ratio range before handing
  // off to Zernio (Zernio returns a hard 400 outside that band). The approval
  // path used to skip this check entirely, so an IG-targeted post with a
  // square crop that read 0.74:1 due to JPEG header rounding would publish
  // through this path, fail at Zernio, and burn 3 retries before giving up.
  // Mirror the cron behaviour: if IG is in the leg list and the carousel
  // violates the rule, drop IG and continue with the other platforms.
  const targetsInstagram = lateProfiles.some((p) => p.platform === 'instagram');
  let droppedIgLegs: { sppId: string; reason: string }[] = [];
  let filteredLateProfiles = lateProfiles;
  if (targetsInstagram) {
    const igIssue = await preflightInstagramAspectForPost(admin, postId, post.post_type);
    if (igIssue) {
      droppedIgLegs = lateProfiles
        .filter((p) => p.platform === 'instagram')
        .map((p) => ({ sppId: p.sppId, reason: igIssue.reason }));
      for (const drop of droppedIgLegs) {
        await admin
          .from('scheduled_post_platforms')
          .update({ status: 'failed', failure_reason: drop.reason })
          .eq('id', drop.sppId);
      }
      filteredLateProfiles = lateProfiles.filter((p) => p.platform !== 'instagram');
      if (filteredLateProfiles.length === 0) {
        throw new Error(`Instagram preflight failed and no other platforms targeted: ${igIssue.reason}`);
      }
    }
  }

  // Reverse map for the per-platform update loop after publish: Zernio echoes
  // back our `late_account_id` as `profileId` in PublishResult.platforms[],
  // and we need to find the matching spp row to stamp external_post_url etc.
  const lateIdToSppId = new Map<string, string>();
  for (const p of filteredLateProfiles) {
    lateIdToSppId.set(p.late_account_id, p.sppId);
  }

  // Look up caption variants on the originating drop video so per-platform
  // overrides survive the draft → publish handoff.
  const { data: video } = await admin
    .from('content_drop_videos')
    .select('caption_variants')
    .eq('scheduled_post_id', postId)
    .maybeSingle<{ caption_variants: CaptionVariants | null }>();

  const captionByPlatform = pickActiveVariants(
    video?.caption_variants ?? null,
    filteredLateProfiles,
  );

  const service = getPostingService();
  const publish = await service.publishPost({
    videoUrl,
    mediaItems,
    caption: post.caption,
    hashtags: post.hashtags ?? [],
    coverImageUrl: post.cover_image_url ?? undefined,
    platformProfileIds: filteredLateProfiles.map((p) => p.late_account_id),
    platformHints: Object.fromEntries(filteredLateProfiles.map((p) => [p.late_account_id, p.platform])),
    captionByPlatform,
    scheduledAt: post.scheduled_at,
    taggedPeople: post.tagged_people ?? undefined,
    collaboratorHandles: post.collaborator_handles ?? undefined,
    // Per-platform overrides — undefined fields fall through to
    // buildPublishBody defaults (caption-derived YT title, share-to-feed=true,
    // TikTok interactions=true). See migration 218.
    youtubeTitle: post.youtube_title ?? undefined,
    youtubeDescription: post.youtube_description ?? undefined,
    youtubeTags: post.youtube_tags ?? undefined,
    youtubePrivacy: post.youtube_privacy ?? undefined,
    youtubeMadeForKids: post.youtube_made_for_kids ?? undefined,
    tiktokAllowComment: post.tiktok_allow_comment ?? undefined,
    tiktokAllowDuet: post.tiktok_allow_duet ?? undefined,
    tiktokAllowStitch: post.tiktok_allow_stitch ?? undefined,
    instagramShareToFeed: post.instagram_share_to_feed ?? undefined,
    // Per-platform routing overrides (migration 255). Same NULL → undefined
    // pattern so the per-platform routers in lib/posting/zernio.ts apply
    // their documented defaults when the row hasn't customized anything.
    instagramContentType: post.instagram_content_type ?? undefined,
    facebookContentType: post.facebook_content_type ?? undefined,
    facebookPageId: post.facebook_page_id ?? undefined,
    linkedinDocumentTitle: post.linkedin_document_title ?? undefined,
    linkedinOrganizationUrn: post.linkedin_organization_urn ?? undefined,
    linkedinDisableLinkPreview: post.linkedin_disable_link_preview ?? undefined,
    firstComment: post.first_comment ?? undefined,
  });

  await admin
    .from('scheduled_posts')
    .update({ status: 'scheduled', late_post_id: publish.externalPostId })
    .eq('id', postId);

  // Backfill per-platform results so the admin scheduler UI shows the real
  // platform-level status (publishedURL, error, etc.). Without this loop the
  // `scheduled_post_platforms` rows stay at `status='pending'` indefinitely
  // even though the post is live on Zernio — the bug that left ~16 stuck
  // rows after the May 1 drop ship and the recovery sweep.
  //
  // Zernio's PlatformResult.status is one of 'published' | 'scheduled' | 'failed'.
  // Treating 'scheduled' as 'failed' (the prior behaviour) was wrong: 'scheduled'
  // means Zernio accepted the leg and is still queued waiting for the platform
  // to confirm. That's the spp 'pending' state. Only mark 'failed' when Zernio
  // actually reported 'failed'. The Weston Funding TikTok+YT legs on 2026-05-04
  // were 'scheduled' (still queued) but our DB showed them failed with NULL
  // failure_reason — that was the conflation, not a real failure.
  let anyTimeoutFailure = false;
  for (const platformResult of publish.platforms) {
    const sppId = lateIdToSppId.get(platformResult.profileId);
    if (!sppId) continue;
    const reason = platformResult.error ?? null;
    if (platformResult.status === 'failed' && reason && /timed out during platform|may have been published externally|gateway timeout/i.test(reason)) {
      anyTimeoutFailure = true;
    }
    const sppStatus =
      platformResult.status === 'published'
        ? 'published'
        : platformResult.status === 'failed'
          ? 'failed'
          : 'pending';
    await admin
      .from('scheduled_post_platforms')
      .update({
        status: sppStatus,
        external_post_id: platformResult.externalPostId ?? null,
        external_post_url: platformResult.externalPostUrl ?? null,
        failure_reason: platformResult.status === 'failed' ? reason : null,
      })
      .eq('id', sppId);

    if (
      platformResult.status === 'failed' &&
      isAccountLevelLegError({
        errorCode: platformResult.errorCode,
        errorType: platformResult.errorType,
        message: platformResult.errorMessage ?? reason,
      })
    ) {
      try {
        await markProfileDisconnectedFromLegFailure({
          admin,
          lateAccountId: platformResult.profileId,
          reason: reason ?? 'unknown',
        });
      } catch (markErr) {
        console.error(
          `[publishScheduledPost] disconnect-mark failed for ${platformResult.profileId}:`,
          markErr,
        );
      }
    }
  }

  // If Zernio reported any "timed out — may have been published externally"
  // legs, re-poll Zernio's authoritative status endpoint and reconcile. The
  // platform usually accepts the post a few seconds after Zernio's wait
  // window lapses, so a fresh GET /posts/{id} flips false-fails back to
  // published. Failure here is non-fatal — the cron sweep is the safety net.
  if (anyTimeoutFailure) {
    try {
      const result = await verifyAndReconcilePost(admin as unknown as ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>, postId);
      if (result.reconciledPlatforms > 0) {
        console.log(
          `[publishScheduledPost] auto-reconciled ${result.reconciledPlatforms} timeout(s) on ${postId}; new status=${result.newPostStatus}`,
        );
      }
    } catch (verifyErr) {
      console.error(`[publishScheduledPost] verify failed for ${postId}:`, verifyErr);
    }
  }

  // Parent-row honesty. Per-leg `spp.failure_reason` is stamped above, but the
  // parent row was set to 'scheduled' before the leg loop ran. Without a
  // parent-level summary the calendar UI reads 'scheduled' with no failure
  // text until the cron's next dupe-probe tick reconciles. Mirror the cron's
  // joined-reason format so a partially-failed publish surfaces immediately.
  // Re-query the spp set after timeout-reconcile so we don't stamp a reason
  // for legs that just got rescued.
  try {
    const { data: postLegRows } = await admin
      .from('scheduled_post_platforms')
      .select('status, failure_reason, social_profiles:social_profile_id (platform)')
      .eq('post_id', postId);
    type LegRow = {
      status: string;
      failure_reason: string | null;
      social_profiles:
        | { platform: SocialPlatform }
        | { platform: SocialPlatform }[]
        | null;
    };
    const failedLegs = ((postLegRows ?? []) as LegRow[]).filter(
      (r) => r.status === 'failed',
    );
    if (failedLegs.length > 0) {
      const summary = failedLegs
        .map((leg) => {
          const sp = Array.isArray(leg.social_profiles)
            ? leg.social_profiles[0]
            : leg.social_profiles;
          const platform = sp?.platform ?? 'unknown';
          return `${platform}: ${leg.failure_reason ?? 'unknown error'}`;
        })
        .join(' | ');
      await admin
        .from('scheduled_posts')
        .update({ failure_reason: summary })
        .eq('id', postId);
    }
  } catch (summaryErr) {
    console.error(
      `[publishScheduledPost] parent failure_reason stamp failed for ${postId}:`,
      summaryErr,
    );
  }

  return { alreadyPublished: false, externalPostId: publish.externalPostId };
  } catch (publishErr) {
    await admin
      .from('scheduled_posts')
      .update({ status: 'draft', updated_at: new Date().toISOString() })
      .eq('id', postId)
      .eq('status', 'publishing');
    throw publishErr;
  }
}

/**
 * Ensure the original video is ingested into Mux. Idempotent — short-circuits
 * if `mux_playback_id` is already set on the row.
 *
 * Triggers a URL-pull ingestion (`assets.create({inputs: [{url}]})`) using the
 * already-public Supabase URL. Mux returns the asset + playback IDs
 * synchronously; the `capped-1080p.mp4` static rendition lands minutes later
 * via the `static_renditions.ready` webhook, which stamps `revised_mp4_url`
 * on the row. The resolver throws "MP4 not ready" until then so the cron
 * retry path handles the wait.
 *
 * Mux ingestion config:
 *   - playback_policies: ['public'] — viewable without signed URLs
 *   - mp4_support: 'capped-1080p'  — guarantees a single deterministic MP4 URL
 *   - video_quality: 'basic'        — matches the revision pipeline; cheaper
 */
async function ensureMuxAssetForVideo(
  admin: SupabaseClient,
  video: VideoRow,
): Promise<string> {
  if (video.mux_playback_id) return video.mux_playback_id;
  if (!video.video_url) throw new Error('Video URL missing');

  const mux = getMux();
  const asset = await mux.video.assets.create({
    inputs: [{ url: video.video_url }],
    playback_policies: ['public'],
    mp4_support: 'capped-1080p',
    video_quality: 'basic',
  });

  const playback = asset.playback_ids?.find((p) => p.policy === 'public');
  if (!playback) {
    throw new Error('Mux asset created but no public playback id returned');
  }

  await admin
    .from('content_drop_videos')
    .update({
      mux_asset_id: asset.id,
      mux_playback_id: playback.id,
      mux_status: 'processing',
    })
    .eq('id', video.id);

  return playback.id;
}

function pickActiveVariants(
  variants: CaptionVariants | null,
  profiles: { platform: SocialPlatform }[],
): Partial<Record<SocialPlatform, string>> {
  if (!variants) return {};
  const active = new Set(profiles.map((p) => p.platform));
  const out: Partial<Record<SocialPlatform, string>> = {};
  for (const [key, value] of Object.entries(variants)) {
    const platform = key as SocialPlatform;
    if (!active.has(platform)) continue;
    const trimmed = (value ?? '').trim();
    if (trimmed) out[platform] = trimmed;
  }
  return out;
}
