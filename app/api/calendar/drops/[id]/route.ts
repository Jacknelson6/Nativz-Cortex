import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import type { CaptionVariantPlatform } from '@/lib/types/calendar';

const VARIANT_PLATFORMS: ReadonlySet<CaptionVariantPlatform> = new Set([
  'tiktok',
  'instagram',
  'youtube',
  'facebook',
]);

interface ShareLinkRow {
  post_review_link_map: Record<string, string> | null;
}

interface CommentRow {
  id: string;
  review_link_id: string;
  author_name: string;
  content: string;
  status: 'approved' | 'changes_requested' | 'comment' | 'caption_edit';
  created_at: string;
  caption_before: string | null;
  caption_after: string | null;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: drop, error } = await supabase
    .from('content_drops')
    .select('*')
    .eq('id', id)
    .single();
  if (error || !drop) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const admin = createAdminClient();
  const [{ data: videos }, { data: shareLinks }, { data: socialProfiles }] = await Promise.all([
    supabase
      .from('content_drop_videos')
      .select('*')
      .eq('drop_id', id)
      .order('order_index'),
    admin
      .from('content_drop_share_links')
      .select('post_review_link_map')
      .eq('drop_id', id),
    admin
      .from('social_profiles')
      .select('platform, late_account_id, is_active')
      .eq('client_id', drop.client_id)
      .eq('is_active', true),
  ]);

  // Image drops: pull asset counts + cover thumbnails so the UI can show
  // carousel badges and render image posts whose `videos.thumbnail_url` is
  // null (only the asset rows have asset_url for image posts).
  const postAssetsByPostId: Record<string, { count: number; cover: string | null }> = {};
  if (drop.media_type === 'image' && (videos ?? []).length > 0) {
    const postIds = (videos ?? []).map((v) => v.id);
    const { data: assetRows } = await admin
      .from('content_drop_post_assets')
      .select('drop_video_id, position, asset_url, thumbnail_url')
      .in('drop_video_id', postIds)
      .order('position', { ascending: true });
    for (const a of assetRows ?? []) {
      const entry = postAssetsByPostId[a.drop_video_id] ?? { count: 0, cover: null };
      entry.count += 1;
      if (a.position === 0) entry.cover = a.thumbnail_url ?? a.asset_url ?? null;
      postAssetsByPostId[a.drop_video_id] = entry;
    }
  }

  const variantPlatforms = Array.from(
    new Set(
      (socialProfiles ?? [])
        .filter(
          (p) =>
            typeof p.late_account_id === 'string' &&
            p.late_account_id.length > 0 &&
            VARIANT_PLATFORMS.has(p.platform as CaptionVariantPlatform),
        )
        .map((p) => p.platform as CaptionVariantPlatform),
    ),
  );

  // Build a combined postId → reviewLinkId[] map across all share links for the drop.
  // A post can appear in multiple links if Jack regenerates the share, so collect them all.
  const postToReviewLinks: Record<string, string[]> = {};
  const reviewLinkToPostId: Record<string, string> = {};
  for (const link of (shareLinks ?? []) as ShareLinkRow[]) {
    for (const [postId, reviewId] of Object.entries(link.post_review_link_map ?? {})) {
      (postToReviewLinks[postId] ||= []).push(reviewId);
      reviewLinkToPostId[reviewId] = postId;
    }
  }

  const reviewLinkIds = Object.keys(reviewLinkToPostId);
  const [{ data: comments }, { data: reviewLinkRows }] = reviewLinkIds.length
    ? await Promise.all([
        admin
          .from('post_review_comments')
          .select('id, review_link_id, author_name, content, status, created_at, caption_before, caption_after')
          .in('review_link_id', reviewLinkIds)
          .order('created_at', { ascending: true }),
        admin
          .from('post_review_links')
          .select('id, revisions_completed_at')
          .in('id', reviewLinkIds),
      ])
    : [{ data: [] as CommentRow[] }, { data: [] as { id: string; revisions_completed_at: string | null }[] }];

  const commentsByPostId: Record<string, CommentRow[]> = {};
  for (const c of (comments ?? []) as CommentRow[]) {
    const postId = reviewLinkToPostId[c.review_link_id];
    if (!postId) continue;
    (commentsByPostId[postId] ||= []).push(c);
  }

  // For each post, take the latest revisions_completed_at across its review links.
  const revisionsCompletedByPostId: Record<string, string> = {};
  for (const row of reviewLinkRows ?? []) {
    if (!row.revisions_completed_at) continue;
    const postId = reviewLinkToPostId[row.id];
    if (!postId) continue;
    const existing = revisionsCompletedByPostId[postId];
    if (!existing || new Date(row.revisions_completed_at) > new Date(existing)) {
      revisionsCompletedByPostId[postId] = row.revisions_completed_at;
    }
  }

  // Pull live publish state for every post that's been scheduled. The drop
  // tile needs:
  //   1. Whether each post has actually published (so "past due" is real,
  //      not a UI artifact of the planned date passing while we were waiting
  //      on Mux/Zernio).
  //   2. Per-platform success/failure breakdown so the tile can show which
  //      legs went out and which broke without opening the post editor.
  const scheduledPostIds = (videos ?? [])
    .map((v) => v.scheduled_post_id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  const postStatusByPostId: Record<string, {
    status: string;
    scheduled_at: string | null;
    published_at: string | null;
    failure_reason: string | null;
    platforms: { platform: string; username: string | null; status: string; failure_reason: string | null; external_post_url: string | null }[];
  }> = {};
  if (scheduledPostIds.length > 0) {
    const { data: postRows } = await admin
      .from('scheduled_posts')
      .select(`
        id, status, scheduled_at, published_at, failure_reason,
        scheduled_post_platforms (
          status,
          failure_reason,
          external_post_url,
          social_profiles ( platform, username )
        )
      `)
      .in('id', scheduledPostIds);
    for (const row of (postRows ?? []) as Array<Record<string, unknown>>) {
      const platforms = ((row.scheduled_post_platforms as Array<Record<string, unknown>>) ?? []).map((spp) => {
        const profile = spp.social_profiles as Record<string, unknown> | null;
        return {
          platform: (profile?.platform as string) ?? '',
          username: (profile?.username as string | null) ?? null,
          status: (spp.status as string) ?? 'pending',
          failure_reason: (spp.failure_reason as string | null) ?? null,
          external_post_url: (spp.external_post_url as string | null) ?? null,
        };
      });
      postStatusByPostId[row.id as string] = {
        status: row.status as string,
        scheduled_at: (row.scheduled_at as string | null) ?? null,
        published_at: (row.published_at as string | null) ?? null,
        failure_reason: (row.failure_reason as string | null) ?? null,
        platforms,
      };
    }
  }

  return NextResponse.json({
    drop,
    videos: videos ?? [],
    commentsByPostId,
    revisionsCompletedByPostId,
    variantPlatforms,
    postStatusByPostId,
    postAssetsByPostId,
  });
}

/**
 * PATCH /api/calendar/drops/[id]
 *
 * Admin-only field-level edits on a content drop. Used by the unified
 * review modal's Team picker (strategist/editor) and Notes textarea so
 * both flows (SMM + editing) save through the same shape. Each field is
 * optional - the caller sends only what changed.
 *
 * Schema:
 *   { strategist_id?: uuid|null, editor_id?: uuid|null, notes?: string|null }
 *
 * `strategist_id` and `editor_id` come from migration 240 (FKs into
 * team_members); `notes` ships in migration 252.
 */
const PatchBody = z
  .object({
    strategist_id: z.string().uuid().nullable().optional(),
    editor_id: z.string().uuid().nullable().optional(),
    notes: z.string().max(4000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'no fields to update' });

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request', detail: parsed.error.message }, { status: 400 });
  }

  const admin = createAdminClient();
  const update: Record<string, string | null> = {};
  if ('strategist_id' in parsed.data) update.strategist_id = parsed.data.strategist_id ?? null;
  if ('editor_id' in parsed.data) update.editor_id = parsed.data.editor_id ?? null;
  if ('notes' in parsed.data) update.notes = parsed.data.notes ?? null;

  const { data, error } = await admin
    .from('content_drops')
    .update(update)
    .eq('id', id)
    .select('id, strategist_id, editor_id, notes')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'update_failed', detail: error?.message }, { status: 500 });
  }
  return NextResponse.json({ drop: data });
}
