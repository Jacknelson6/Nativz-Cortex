import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-keys/validate';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/v1/posts/[id]
 *
 * Fetch a single scheduled post by UUID with full platform and media details.
 *
 * @auth API key (Bearer token via Authorization header)
 * @param id - Scheduled post UUID
 * @returns {{ post: ScheduledPost & { scheduled_post_platforms, scheduled_post_media } }}
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await validateApiKey(request);
  if ('error' in auth) return auth.error;

  const { id } = await params;
  const admin = createAdminClient();

  const { data: post, error } = await admin
    .from('scheduled_posts')
    .select('*, scheduled_post_platforms(id, social_profile_id, status, social_profiles(platform, username)), scheduled_post_media(id, media_id, sort_order, scheduler_media(filename, storage_path, thumbnail_url))')
    .eq('id', id)
    .single();

  if (error || !post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  return NextResponse.json({ post });
}
