import type { SupabaseClient } from '@supabase/supabase-js';
import { getPostingService, type SocialPlatform } from '@/lib/posting';
import type { CaptionVariants } from '@/lib/types/calendar';
import { distributeSlots } from './distribute-slots';
import { verifyAndReconcilePost } from './verify-post';

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
      'id, drop_id, video_url, thumbnail_url, draft_caption, draft_hashtags, caption_variants, drive_file_name, duration_seconds, size_bytes, mime_type, order_index, media_type',
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
        mediaInserts = [{
          filename: video.drive_file_name,
          storage_path: video.video_url,
          thumbnail_url: video.thumbnail_url,
          duration_seconds: video.duration_seconds,
          file_size_bytes: video.size_bytes,
          mime_type: video.mime_type,
          late_media_url: video.video_url,
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
      'youtube_title, youtube_description, youtube_tags, youtube_privacy, youtube_made_for_kids, ' +
      'tiktok_allow_comment, tiktok_allow_duet, tiktok_allow_stitch, instagram_share_to_feed',
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
      youtube_title: string | null;
      youtube_description: string | null;
      youtube_tags: string[] | null;
      youtube_privacy: 'public' | 'unlisted' | 'private' | null;
      youtube_made_for_kids: boolean | null;
      tiktok_allow_comment: boolean | null;
      tiktok_allow_duet: boolean | null;
      tiktok_allow_stitch: boolean | null;
      instagram_share_to_feed: boolean | null;
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

  // Pull all linked media rows in sort order. For video posts there's exactly
  // one; for image carousels there are 1..10 in display order.
  const { data: mediaLinks } = await admin
    .from('scheduled_post_media')
    .select('media_id, sort_order, scheduler_media:media_id (late_media_url, mime_type)')
    .eq('post_id', postId)
    .order('sort_order');
  type MediaLink = {
    media_id: string;
    sort_order: number;
    scheduler_media: { late_media_url: string | null; mime_type: string | null } | { late_media_url: string | null; mime_type: string | null }[] | null;
  };
  const links = (mediaLinks ?? []) as MediaLink[];
  const flatMedia = links
    .map((l) => {
      const m = Array.isArray(l.scheduler_media) ? l.scheduler_media[0] : l.scheduler_media;
      return m && m.late_media_url ? { url: m.late_media_url, mime: m.mime_type } : null;
    })
    .filter((m): m is { url: string; mime: string | null } => !!m);
  if (flatMedia.length === 0) throw new Error('Draft post is missing a media URL');

  const isImagePost = post.post_type === 'image' || post.post_type === 'carousel';
  const mediaItems = isImagePost
    ? flatMedia.map((m) => ({ type: 'image' as const, url: m.url }))
    : undefined;
  const videoUrl = isImagePost ? undefined : flatMedia[0].url;

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
  const lateProfiles = sppRows
    .flatMap((p) => {
      const sp = p.social_profiles;
      const flat = Array.isArray(sp) ? sp : sp ? [sp] : [];
      return flat.map((x) => ({ ...x, sppId: p.id, profileId: p.social_profile_id }));
    })
    .filter(
      (p): p is { platform: SocialPlatform; late_account_id: string; sppId: string; profileId: string } =>
        !!p && typeof p === 'object' && 'late_account_id' in p && !!(p as { late_account_id: string }).late_account_id,
    );
  if (lateProfiles.length === 0) throw new Error('Draft post has no platforms');

  // Reverse map for the per-platform update loop after publish: Zernio echoes
  // back our `late_account_id` as `profileId` in PublishResult.platforms[],
  // and we need to find the matching spp row to stamp external_post_url etc.
  const lateIdToSppId = new Map<string, string>();
  for (const p of lateProfiles) {
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
    lateProfiles,
  );

  const service = getPostingService();
  const publish = await service.publishPost({
    videoUrl,
    mediaItems,
    caption: post.caption,
    hashtags: post.hashtags ?? [],
    coverImageUrl: post.cover_image_url ?? undefined,
    platformProfileIds: lateProfiles.map((p) => p.late_account_id),
    platformHints: Object.fromEntries(lateProfiles.map((p) => [p.late_account_id, p.platform])),
    captionByPlatform,
    scheduledAt: post.scheduled_at,
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
  let anyTimeoutFailure = false;
  for (const platformResult of publish.platforms) {
    const sppId = lateIdToSppId.get(platformResult.profileId);
    if (!sppId) continue;
    const isFailed = platformResult.status !== 'published';
    const reason = platformResult.error ?? null;
    if (isFailed && reason && /timed out during platform|may have been published externally|gateway timeout/i.test(reason)) {
      anyTimeoutFailure = true;
    }
    await admin
      .from('scheduled_post_platforms')
      .update({
        status: isFailed ? 'failed' : 'published',
        external_post_id: platformResult.externalPostId ?? null,
        external_post_url: platformResult.externalPostUrl ?? null,
        failure_reason: reason,
      })
      .eq('id', sppId);
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

  return { alreadyPublished: false, externalPostId: publish.externalPostId };
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
