import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  const { data: drop } = await admin
    .from('content_drops')
    .select('id, status')
    .eq('id', id)
    .single();
  if (!drop) return NextResponse.json({ error: 'content calendar not found' }, { status: 404 });

  const { data: videos } = await admin
    .from('content_drop_videos')
    .select('id, scheduled_post_id')
    .eq('drop_id', id)
    .not('scheduled_post_id', 'is', null);

  const postIds = (videos ?? [])
    .map((v) => v.scheduled_post_id as string | null)
    .filter((p): p is string => typeof p === 'string');

  if (postIds.length === 0) {
    return NextResponse.json({ error: 'No scheduled posts in this content calendar yet' }, { status: 400 });
  }

  const linkRows = postIds.map((postId) => ({ post_id: postId }));
  const { data: reviewLinks, error: linkErr } = await admin
    .from('post_review_links')
    .insert(linkRows)
    .select('id, post_id, token');
  if (linkErr || !reviewLinks) {
    return NextResponse.json({ error: linkErr?.message ?? 'Failed to mint review links' }, { status: 500 });
  }

  const reviewMap: Record<string, string> = {};
  for (const rl of reviewLinks) {
    reviewMap[rl.post_id as string] = rl.id as string;
  }

  const { data: shareLink, error: shareErr } = await admin
    .from('content_drop_share_links')
    .insert({
      drop_id: id,
      included_post_ids: postIds,
      post_review_link_map: reviewMap,
    })
    .select('id, token, expires_at')
    .single();
  if (shareErr || !shareLink) {
    return NextResponse.json({ error: shareErr?.message ?? 'Failed to create share link' }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  return NextResponse.json({
    link: shareLink,
    url: `${appUrl}/c/${shareLink.token}`,
  });
}
