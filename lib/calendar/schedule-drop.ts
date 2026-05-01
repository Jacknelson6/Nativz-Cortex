import type { SupabaseClient } from '@supabase/supabase-js';
import { getPostingService, type SocialPlatform } from '@/lib/posting';
import type { CaptionVariants } from '@/lib/types/calendar';
import { distributeSlots } from './distribute-slots';

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
      'id, drop_id, video_url, thumbnail_url, draft_caption, draft_hashtags, caption_variants, drive_file_name, duration_seconds, size_bytes, mime_type, order_index',
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
      if (!video.video_url) throw new Error('Video URL missing');
      if (!video.draft_caption) throw new Error('Draft caption missing');

      const { data: media, error: mediaErr } = await admin
        .from('scheduler_media')
        .insert({
          client_id: (drop as DropRow).client_id,
          uploaded_by: (drop as DropRow).created_by,
          filename: video.drive_file_name,
          storage_path: video.video_url,
          thumbnail_url: video.thumbnail_url,
          duration_seconds: video.duration_seconds,
          file_size_bytes: video.size_bytes,
          mime_type: video.mime_type,
          is_used: true,
          late_media_url: video.video_url,
        })
        .select('id')
        .single();
      if (mediaErr || !media) throw new Error(mediaErr?.message ?? 'Failed to insert media');

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
          cover_image_url: video.thumbnail_url,
          post_type: 'reel',
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

      const { error: linkErr } = await admin
        .from('scheduled_post_media')
        .insert({ post_id: post.id, media_id: media.id, sort_order: 0 });
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
    .select('id, client_id, caption, hashtags, scheduled_at, status, late_post_id, cover_image_url')
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
    }>();
  if (postErr || !post) throw new Error(`Post ${postId} not found`);

  if (post.late_post_id || post.status !== 'draft') {
    return { alreadyPublished: true, externalPostId: post.late_post_id ?? undefined };
  }

  // Pull the linked media row to get the late_media_url for the actual file.
  const { data: mediaLink } = await admin
    .from('scheduled_post_media')
    .select('media_id, scheduler_media:media_id (late_media_url)')
    .eq('post_id', postId)
    .order('sort_order')
    .limit(1)
    .single<{ media_id: string; scheduler_media: { late_media_url: string | null } | null }>();
  const videoUrl = mediaLink?.scheduler_media?.late_media_url ?? null;
  if (!videoUrl) throw new Error('Draft post is missing a media URL');

  // Pull the platforms this post is targeting + the brand's caption variants.
  const { data: platforms } = await admin
    .from('scheduled_post_platforms')
    .select('social_profiles:social_profile_id (platform, late_account_id)')
    .eq('post_id', postId);
  // Supabase types embedded joins as arrays; the FK is 1-to-1, so flatten.
  const lateProfiles = (platforms ?? [])
    .flatMap((p) => {
      const sp = (p as unknown as { social_profiles: unknown }).social_profiles;
      return Array.isArray(sp) ? sp : sp ? [sp] : [];
    })
    .filter(
      (p): p is { platform: SocialPlatform; late_account_id: string } =>
        !!p && typeof p === 'object' && 'late_account_id' in p && !!(p as { late_account_id: string }).late_account_id,
    );
  if (lateProfiles.length === 0) throw new Error('Draft post has no platforms');

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
    caption: post.caption,
    hashtags: post.hashtags ?? [],
    coverImageUrl: post.cover_image_url ?? undefined,
    platformProfileIds: lateProfiles.map((p) => p.late_account_id),
    platformHints: Object.fromEntries(lateProfiles.map((p) => [p.late_account_id, p.platform])),
    captionByPlatform,
    scheduledAt: post.scheduled_at,
  });

  await admin
    .from('scheduled_posts')
    .update({ status: 'scheduled', late_post_id: publish.externalPostId })
    .eq('id', postId);

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
