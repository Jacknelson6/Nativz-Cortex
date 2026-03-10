import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validateApiKey } from '@/lib/api-keys/validate';
import { createAdminClient } from '@/lib/supabase/admin';

const createPostSchema = z.object({
  client_id: z.string().uuid(),
  caption: z.string().default(''),
  hashtags: z.array(z.string()).default([]),
  scheduled_at: z.string().nullable().default(null),
  status: z.enum(['draft', 'scheduled']).default('draft'),
  platform_profile_ids: z.array(z.string()).default([]),
  media_ids: z.array(z.string()).default([]),
});

export async function GET(request: NextRequest) {
  const auth = await validateApiKey(request);
  if ('error' in auth) return auth.error;

  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('client_id');
  const status = searchParams.get('status');

  if (!clientId) {
    return NextResponse.json({ error: 'client_id is required' }, { status: 400 });
  }

  let query = admin
    .from('scheduled_posts')
    .select('id, client_id, caption, hashtags, scheduled_at, status, post_type, created_at')
    .eq('client_id', clientId)
    .order('scheduled_at', { ascending: true, nullsFirst: false });

  if (status) query = query.eq('status', status);

  const { data: posts, error } = await query;
  if (error) {
    return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 });
  }

  return NextResponse.json({ posts: posts ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await validateApiKey(request);
  if ('error' in auth) return auth.error;

  const body = await request.json();
  const parsed = createPostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  const data = parsed.data;
  const admin = createAdminClient();

  const { data: post, error } = await admin
    .from('scheduled_posts')
    .insert({
      client_id: data.client_id,
      created_by: auth.ctx.userId,
      caption: data.caption,
      hashtags: data.hashtags,
      scheduled_at: data.scheduled_at,
      status: data.status,
    })
    .select()
    .single();

  if (error || !post) {
    return NextResponse.json({ error: 'Failed to create post' }, { status: 500 });
  }

  // Link platform profiles if provided
  if (data.platform_profile_ids.length > 0) {
    await admin
      .from('scheduled_post_platforms')
      .insert(
        data.platform_profile_ids.map(profileId => ({
          post_id: post.id,
          social_profile_id: profileId,
          status: 'pending',
        }))
      );
  }

  // Link media if provided
  if (data.media_ids.length > 0) {
    await admin
      .from('scheduled_post_media')
      .insert(
        data.media_ids.map((mediaId, i) => ({
          post_id: post.id,
          media_id: mediaId,
          sort_order: i,
        }))
      );
  }

  return NextResponse.json({ post }, { status: 201 });
}
