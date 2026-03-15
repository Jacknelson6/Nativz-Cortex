import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

const CreateShareLinkSchema = z.object({
  client_id: z.string().uuid(),
  post_ids: z.array(z.string().uuid()).min(1, 'Select at least one post'),
  label: z.string().min(1).default('Review link'),
});

/**
 * POST /api/scheduler/share
 *
 * Create a shareable calendar review link for a selected set of posts. Clients use
 * the generated URL to view and provide feedback on scheduled content without logging in.
 *
 * @auth Required (any authenticated user)
 * @body client_id - Client UUID (required)
 * @body post_ids - Scheduled post UUIDs to share (min 1 required)
 * @body label - Label for the review link (default 'Review link')
 * @returns {{ link: ClientReviewLink, url: string }}
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = CreateShareLinkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const adminClient = createAdminClient();

    const { data: link, error } = await adminClient
      .from('client_review_links')
      .insert({
        client_id: parsed.data.client_id,
        created_by: user.id,
        label: parsed.data.label,
        post_ids: parsed.data.post_ids,
      })
      .select()
      .single();

    if (error || !link) {
      console.error('Create share link error:', error);
      return NextResponse.json({ error: 'Failed to create share link' }, { status: 500 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    return NextResponse.json({
      link,
      url: `${appUrl}/shared/calendar/${link.token}`,
    });
  } catch (error) {
    console.error('POST /api/scheduler/share error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/scheduler/share
 *
 * Fetch posts for a shared calendar review link. Public endpoint used by the client
 * review page. Returns posts enriched with platform info, media thumbnails, and
 * per-post review status from any existing comments.
 *
 * @auth None (public — token provides authorization)
 * @query token - Calendar review link token (required)
 * @returns {{ client_name, label, posts: EnrichedPost[] }}
 */
export async function GET(request: NextRequest) {
  try {
    const token = new URL(request.url).searchParams.get('token');
    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Find the review link
    const { data: link, error: linkError } = await adminClient
      .from('client_review_links')
      .select('id, client_id, label, expires_at, is_active, post_ids')
      .eq('token', token)
      .single();

    if (linkError || !link) {
      return NextResponse.json({ error: 'Invalid share link' }, { status: 404 });
    }

    if (!link.is_active) {
      return NextResponse.json({ error: 'This share link has been deactivated' }, { status: 410 });
    }

    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This share link has expired' }, { status: 410 });
    }

    // Get client name
    const { data: client } = await adminClient
      .from('clients')
      .select('name')
      .eq('id', link.client_id)
      .single();

    // Get only the selected posts (or all if post_ids is empty for backwards compat)
    const selectedIds = (link.post_ids as string[] | null) ?? [];
    let postsQuery = adminClient
      .from('scheduled_posts')
      .select(`
        id,
        status,
        scheduled_at,
        caption,
        hashtags,
        post_type,
        cover_image_url,
        late_media_url,
        created_at
      `)
      .eq('client_id', link.client_id)
      .order('scheduled_at', { ascending: true });

    if (selectedIds.length > 0) {
      postsQuery = postsQuery.in('id', selectedIds);
    } else {
      postsQuery = postsQuery.in('status', ['draft', 'scheduled', 'published']);
    }

    const { data: posts } = await postsQuery;

    // Get platforms for each post
    const postIds = (posts ?? []).map(p => p.id);
    const { data: platforms } = postIds.length > 0
      ? await adminClient
          .from('scheduled_post_platforms')
          .select('post_id, social_profiles(platform, username)')
          .in('post_id', postIds)
      : { data: [] };

    // Get media for each post
    const { data: postMedia } = postIds.length > 0
      ? await adminClient
          .from('scheduled_post_media')
          .select('post_id, scheduler_media(thumbnail_url, late_media_url)')
          .in('post_id', postIds)
      : { data: [] };

    // Get review comments for these posts
    const { data: reviewLinks } = postIds.length > 0
      ? await adminClient
          .from('post_review_links')
          .select('post_id, id')
          .in('post_id', postIds)
      : { data: [] };

    const reviewLinkIds = (reviewLinks ?? []).map(r => r.id);
    const { data: comments } = reviewLinkIds.length > 0
      ? await adminClient
          .from('post_review_comments')
          .select('review_link_id, status')
          .in('review_link_id', reviewLinkIds)
      : { data: [] };

    // Build review status per post
    const reviewStatusByPost: Record<string, string> = {};
    for (const rl of reviewLinks ?? []) {
      const postComments = (comments ?? []).filter(c => c.review_link_id === rl.id);
      if (postComments.some(c => c.status === 'approved')) {
        reviewStatusByPost[rl.post_id] = 'approved';
      } else if (postComments.some(c => c.status === 'changes_requested')) {
        reviewStatusByPost[rl.post_id] = 'changes_requested';
      } else if (postComments.length > 0) {
        reviewStatusByPost[rl.post_id] = 'pending';
      }
    }

    // Build platform map
    const platformsByPost: Record<string, { platform: string; username: string }[]> = {};
    for (const p of platforms ?? []) {
      if (!platformsByPost[p.post_id]) platformsByPost[p.post_id] = [];
      const sp = p.social_profiles as unknown as Record<string, unknown> | null;
      if (sp) {
        platformsByPost[p.post_id].push({
          platform: sp.platform as string,
          username: sp.username as string,
        });
      }
    }

    // Build media map
    const mediaByPost: Record<string, string | null> = {};
    for (const m of postMedia ?? []) {
      const sm = m.scheduler_media as unknown as Record<string, unknown> | null;
      if (sm) {
        mediaByPost[m.post_id] = (sm.thumbnail_url as string) ?? (sm.late_media_url as string) ?? null;
      }
    }

    const enrichedPosts = (posts ?? []).map(p => ({
      id: p.id,
      status: p.status,
      scheduled_at: p.scheduled_at,
      caption: p.caption ?? '',
      hashtags: p.hashtags ?? [],
      post_type: p.post_type,
      cover_image_url: p.cover_image_url,
      thumbnail_url: mediaByPost[p.id] ?? p.late_media_url ?? p.cover_image_url ?? null,
      platforms: platformsByPost[p.id] ?? [],
      review_status: reviewStatusByPost[p.id] ?? 'none',
    }));

    return NextResponse.json({
      client_name: client?.name ?? 'Client',
      label: link.label,
      posts: enrichedPosts,
    });
  } catch (error) {
    console.error('GET /api/scheduler/share error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
