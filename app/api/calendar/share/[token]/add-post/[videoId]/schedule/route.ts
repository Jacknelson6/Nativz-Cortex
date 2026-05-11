import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import type { SocialPlatform } from '@/lib/posting';

const ScheduleSchema = z.object({
  // ISO timestamp for the post slot. The browser computes Chicago noon UTC
  // for the picked day; we accept ISO so the storage format matches every
  // other scheduled_at value on the table.
  scheduledAt: z.string().datetime(),
  caption: z.string().min(1).max(2200),
  hashtags: z.array(z.string()).max(50).optional(),
});

interface ShareLinkRow {
  id: string;
  drop_id: string;
  client_id: string;
  included_post_ids: string[];
  post_review_link_map: Record<string, string>;
  expires_at: string;
}

interface VideoRow {
  id: string;
  drop_id: string;
  status: string;
  scheduled_post_id: string | null;
  drive_file_name: string | null;
  duration_seconds: number | null;
  size_bytes: number | null;
  mime_type: string | null;
  thumbnail_url: string | null;
  mux_playback_id: string | null;
  mux_status: string | null;
}

/**
 * POST /api/calendar/share/[token]/add-post/[videoId]/schedule
 *
 * Admin-only. Last step of the "+ Add new video" flow.
 *
 * Takes the editable caption + the picked day, then:
 *   1. Saves caption + hashtags onto the content_drop_videos row.
 *   2. Inserts scheduler_media pointing at the Mux capped-1080p MP4 URL.
 *   3. Creates a scheduled_posts row in 'draft' status (Zernio is NOT
 *      contacted — publish happens later on client approval, same as the
 *      rest of the share-link approval pipeline).
 *   4. Wires scheduled_post_platforms for every connected social profile on
 *      the brand, and links the media via scheduled_post_media.
 *   5. Mints a fresh post_review_links row for the new post and adds the
 *      post id to the share link's included_post_ids + post_review_link_map.
 *
 * The share link naturally bounces back to "Needs approval" the moment this
 * post lands — the all-approved check sees a new post with no approval
 * comment yet, so existing approvals stay intact and only the new card
 * needs sign-off.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string; videoId: string }> },
) {
  const { token, videoId } = await ctx.params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ error: 'admin only' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = ScheduleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'invalid body' },
      { status: 400 },
    );
  }
  const { scheduledAt, caption, hashtags } = parsed.data;

  const admin = createAdminClient();
  const { data: link } = await admin
    .from('content_drop_share_links')
    .select(
      'id, drop_id, client_id, included_post_ids, post_review_link_map, expires_at',
    )
    .eq('token', token)
    .single<ShareLinkRow>();
  if (!link) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'link expired' }, { status: 410 });
  }

  const { data: video } = await admin
    .from('content_drop_videos')
    .select(
      'id, drop_id, status, scheduled_post_id, drive_file_name, duration_seconds, size_bytes, mime_type, thumbnail_url, mux_playback_id, mux_status',
    )
    .eq('id', videoId)
    .single<VideoRow>();
  if (!video) return NextResponse.json({ error: 'video not found' }, { status: 404 });
  if (video.drop_id !== link.drop_id) {
    return NextResponse.json({ error: 'video not on this share link' }, { status: 400 });
  }
  if (video.scheduled_post_id) {
    return NextResponse.json({ error: 'video already scheduled' }, { status: 409 });
  }
  if (!video.mux_playback_id) {
    return NextResponse.json(
      { error: 'video is still processing — try again in a moment' },
      { status: 409 },
    );
  }

  // Refuse to schedule unless every Mux step is done. The publish path
  // resolves media off the capped-1080p MP4 URL, which only exists after
  // static_renditions.ready has fired on this asset.
  if (video.mux_status !== 'ready') {
    return NextResponse.json(
      { error: `mux not ready (status=${video.mux_status})` },
      { status: 409 },
    );
  }

  // Cleaned hashtag list — strip leading '#' so the storage format matches
  // every other content_drop_videos row (the publish path re-adds the hash
  // at render time).
  const cleanHashtags = (hashtags ?? [])
    .map((t) => t.replace(/^#/, '').trim())
    .filter(Boolean);

  // 1. Save caption + hashtags onto the drop video row so the share page
  //    poller picks up the editor's final wording (in case they tweaked it
  //    between the auto-gen and Submit).
  await admin
    .from('content_drop_videos')
    .update({
      draft_caption: caption,
      draft_hashtags: cleanHashtags,
      draft_scheduled_at: scheduledAt,
      status: 'ready',
    })
    .eq('id', video.id);

  // 2. Resolve connected social profiles for the brand. Zernio-connected
  //    profiles only (late_account_id present) — the rest get filtered as
  //    "not connected to Zernio" downstream.
  const { data: profiles } = await admin
    .from('social_profiles')
    .select('id, platform, late_account_id, is_active')
    .eq('client_id', link.client_id)
    .eq('is_active', true);

  const lateProfiles = (profiles ?? []).filter(
    (p): p is {
      id: string;
      platform: SocialPlatform;
      late_account_id: string;
      is_active: boolean;
    } =>
      typeof (p as { late_account_id?: unknown }).late_account_id === 'string' &&
      (p as { late_account_id: string }).late_account_id.length > 0,
  );
  if (lateProfiles.length === 0) {
    return NextResponse.json(
      { error: 'No connected social profiles for this brand. Connect Zernio profiles first.' },
      { status: 409 },
    );
  }

  const muxMp4Url = `https://stream.mux.com/${video.mux_playback_id}/capped-1080p.mp4`;

  // 3. scheduler_media row pointed at Mux. `is_used=true` so the cleanup
  //    sweep treats it like the rest of the in-flight media.
  const { data: insertedMedia, error: mediaErr } = await admin
    .from('scheduler_media')
    .insert({
      client_id: link.client_id,
      uploaded_by: user.id,
      filename: video.drive_file_name ?? 'new-post.mp4',
      storage_path: muxMp4Url,
      thumbnail_url: video.thumbnail_url,
      duration_seconds: video.duration_seconds,
      file_size_bytes: video.size_bytes,
      mime_type: video.mime_type,
      late_media_url: muxMp4Url,
      is_used: true,
    })
    .select('id')
    .single<{ id: string }>();
  if (mediaErr || !insertedMedia) {
    return NextResponse.json(
      { error: mediaErr?.message ?? 'Failed to insert media' },
      { status: 500 },
    );
  }

  // 4. scheduled_posts as 'draft' — the share-link approval flow flips this
  //    to 'scheduled' via publishScheduledPost on client approval.
  const { data: post, error: postErr } = await admin
    .from('scheduled_posts')
    .insert({
      client_id: link.client_id,
      created_by: user.id,
      caption,
      hashtags: cleanHashtags,
      scheduled_at: scheduledAt,
      status: 'draft',
      cover_image_url: video.thumbnail_url,
      post_type: 'reel',
    })
    .select('id')
    .single<{ id: string }>();
  if (postErr || !post) {
    return NextResponse.json(
      { error: postErr?.message ?? 'Failed to insert post' },
      { status: 500 },
    );
  }

  // 5. scheduled_post_platforms (one per connected profile, all 'pending')
  //    + scheduled_post_media (linking the Mux URL).
  const { error: platformErr } = await admin
    .from('scheduled_post_platforms')
    .insert(
      lateProfiles.map((p) => ({
        post_id: post.id,
        social_profile_id: p.id,
        status: 'pending' as const,
      })),
    );
  if (platformErr) {
    return NextResponse.json({ error: platformErr.message }, { status: 500 });
  }

  const { error: linkErr } = await admin
    .from('scheduled_post_media')
    .insert([{ post_id: post.id, media_id: insertedMedia.id, sort_order: 0 }]);
  if (linkErr) {
    return NextResponse.json({ error: linkErr.message }, { status: 500 });
  }

  // 6. Attach the new post id back to the drop video so the share-page
  //    GET picks it up via the included_post_ids → scheduled_posts join.
  await admin
    .from('content_drop_videos')
    .update({ scheduled_post_id: post.id, draft_scheduled_at: scheduledAt })
    .eq('id', video.id);

  // 7. Mint a fresh post_review_links row + add this post to the share
  //    link's surface. Token + expires_at default at the DB level.
  const { data: reviewLink, error: reviewErr } = await admin
    .from('post_review_links')
    .insert({ post_id: post.id })
    .select('id')
    .single<{ id: string }>();
  if (reviewErr || !reviewLink) {
    return NextResponse.json(
      { error: reviewErr?.message ?? 'Failed to mint review link' },
      { status: 500 },
    );
  }

  // Re-fetch the included_post_ids + map under a no-races assumption (only
  // one editor adds a new video at a time). Merge + write.
  const nextIncluded = [...(link.included_post_ids ?? []), post.id];
  const nextMap = { ...(link.post_review_link_map ?? {}), [post.id]: reviewLink.id };
  const { error: linkUpdateErr } = await admin
    .from('content_drop_share_links')
    .update({
      included_post_ids: nextIncluded,
      post_review_link_map: nextMap,
    })
    .eq('id', link.id);
  if (linkUpdateErr) {
    return NextResponse.json({ error: linkUpdateErr.message }, { status: 500 });
  }

  return NextResponse.json({
    postId: post.id,
    reviewLinkId: reviewLink.id,
    scheduledAt,
  });
}
