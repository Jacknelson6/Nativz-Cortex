import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

const CreateReviewLinkSchema = z.object({
  post_id: z.string().uuid(),
});

// POST: Generate a review link for a post (authenticated)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = CreateReviewLinkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const adminClient = createAdminClient();

    const { data: link, error } = await adminClient
      .from('post_review_links')
      .insert({ post_id: parsed.data.post_id })
      .select()
      .single();

    if (error || !link) {
      console.error('Create review link error:', error);
      return NextResponse.json({ error: 'Failed to create review link' }, { status: 500 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    return NextResponse.json({
      link,
      url: `${appUrl}/shared/post/${link.token}`,
    });
  } catch (error) {
    console.error('POST /api/scheduler/review error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET: Fetch post data by review token (public — no auth required)
export async function GET(request: NextRequest) {
  try {
    const token = new URL(request.url).searchParams.get('token');
    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Find the review link
    const { data: link, error: linkError } = await adminClient
      .from('post_review_links')
      .select('*, scheduled_posts(*, scheduled_post_media(scheduler_media(storage_path, thumbnail_url)))')
      .eq('token', token)
      .single();

    if (linkError || !link) {
      return NextResponse.json({ error: 'Invalid or expired review link' }, { status: 404 });
    }

    // Check expiry
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Review link has expired' }, { status: 410 });
    }

    // Get comments
    const { data: comments } = await adminClient
      .from('post_review_comments')
      .select('*')
      .eq('review_link_id', link.id)
      .order('created_at', { ascending: true });

    // Get platform info
    const post = link.scheduled_posts as Record<string, unknown>;
    const { data: platforms } = await adminClient
      .from('scheduled_post_platforms')
      .select('social_profiles(platform, username)')
      .eq('post_id', post.id);

    return NextResponse.json({
      post: {
        caption: post.caption ?? '',
        hashtags: post.hashtags ?? [],
        scheduled_at: post.scheduled_at,
        status: post.status,
        post_type: post.post_type,
        thumbnail_url: (post.scheduled_post_media as Array<Record<string, unknown>>)?.[0]
          ?.scheduler_media
          ? ((post.scheduled_post_media as Array<Record<string, unknown>>)?.[0]?.scheduler_media as Record<string, unknown>)?.thumbnail_url
          : null,
        platforms: (platforms ?? []).map((p: Record<string, unknown>) => {
          const sp = p.social_profiles as Record<string, unknown> | null;
          return { platform: sp?.platform, username: sp?.username };
        }),
      },
      comments: comments ?? [],
      review_link_id: link.id,
    });
  } catch (error) {
    console.error('GET /api/scheduler/review error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
