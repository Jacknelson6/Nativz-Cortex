import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
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
  status: 'approved' | 'changes_requested' | 'comment';
  created_at: string;
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
  const { data: comments } = reviewLinkIds.length
    ? await admin
        .from('post_review_comments')
        .select('id, review_link_id, author_name, content, status, created_at')
        .in('review_link_id', reviewLinkIds)
        .order('created_at', { ascending: true })
    : { data: [] as CommentRow[] };

  const commentsByPostId: Record<string, CommentRow[]> = {};
  for (const c of (comments ?? []) as CommentRow[]) {
    const postId = reviewLinkToPostId[c.review_link_id];
    if (!postId) continue;
    (commentsByPostId[postId] ||= []).push(c);
  }

  return NextResponse.json({
    drop,
    videos: videos ?? [],
    commentsByPostId,
    variantPlatforms,
  });
}
