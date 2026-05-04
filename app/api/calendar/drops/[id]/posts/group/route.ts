import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Merge multiple image posts into a single carousel post. The lowest-ordered
// post in the selection becomes the "cover" post; assets from later posts get
// re-pointed at it (positions renumbered) and the source posts are deleted.
//
// IG/FB cap carousels at 10 items, so we reject merges that would exceed it.
// We refuse to merge posts that already have a scheduled_post_id — once a post
// has been routed through scheduleDrop, mutating its assets would diverge the
// scheduler_media rows from what's about to publish.

const BodySchema = z.object({
  postIds: z.array(z.string().uuid()).min(2),
});

const MAX_CAROUSEL_ITEMS = 10;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: dropId } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: z.infer<typeof BodySchema>;
  try {
    const raw = await req.json().catch(() => ({}));
    body = BodySchema.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'invalid body';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: drop, error: dropErr } = await admin
    .from('content_drops')
    .select('id, media_type, status')
    .eq('id', dropId)
    .single();
  if (dropErr || !drop) {
    return NextResponse.json({ error: 'content calendar not found' }, { status: 404 });
  }
  if (drop.media_type !== 'image') {
    return NextResponse.json(
      { error: 'carousel grouping only applies to image content calendars' },
      { status: 400 },
    );
  }

  const uniquePostIds = Array.from(new Set(body.postIds));

  const { data: postRows, error: postsErr } = await admin
    .from('content_drop_videos')
    .select('id, drop_id, order_index, scheduled_post_id, status')
    .eq('drop_id', dropId)
    .in('id', uniquePostIds);
  if (postsErr) {
    return NextResponse.json({ error: postsErr.message }, { status: 500 });
  }
  if (!postRows || postRows.length !== uniquePostIds.length) {
    return NextResponse.json(
      { error: 'one or more posts do not belong to this content calendar' },
      { status: 400 },
    );
  }

  const alreadyScheduled = postRows.find((p) => p.scheduled_post_id);
  if (alreadyScheduled) {
    return NextResponse.json(
      { error: 'cannot merge posts that have already been scheduled' },
      { status: 400 },
    );
  }

  const ordered = [...postRows].sort((a, b) => a.order_index - b.order_index);
  const coverPost = ordered[0];
  const sourcePosts = ordered.slice(1);

  const { data: assetRows, error: assetsErr } = await admin
    .from('content_drop_post_assets')
    .select('id, drop_video_id, position')
    .in(
      'drop_video_id',
      ordered.map((p) => p.id),
    );
  if (assetsErr) {
    return NextResponse.json({ error: assetsErr.message }, { status: 500 });
  }

  // Order assets by (post order_index, current position) — that's the order
  // they'll appear in the carousel. Cover post's existing assets stay first.
  const orderIndexById = new Map(ordered.map((p) => [p.id, p.order_index]));
  const sortedAssets = (assetRows ?? []).sort((a, b) => {
    const ao = orderIndexById.get(a.drop_video_id) ?? 0;
    const bo = orderIndexById.get(b.drop_video_id) ?? 0;
    if (ao !== bo) return ao - bo;
    return a.position - b.position;
  });

  if (sortedAssets.length === 0) {
    return NextResponse.json(
      { error: 'selected posts have no assets to merge' },
      { status: 400 },
    );
  }
  if (sortedAssets.length > MAX_CAROUSEL_ITEMS) {
    return NextResponse.json(
      {
        error: `Instagram and Facebook cap carousels at ${MAX_CAROUSEL_ITEMS} items (selection has ${sortedAssets.length}).`,
      },
      { status: 400 },
    );
  }

  // Two-phase update to dodge the unique (drop_video_id, position) index.
  // Phase 1: park every asset at a negative position scoped to the cover post.
  // Phase 2: assign the final 0..N-1 ordering. We can't just do a single
  // update-and-renumber because re-pointing a source post's asset to the
  // cover would collide with the cover's existing assets at the same
  // position.
  for (let i = 0; i < sortedAssets.length; i++) {
    const asset = sortedAssets[i];
    const parkPosition = -1 - i;
    const { error: parkErr } = await admin
      .from('content_drop_post_assets')
      .update({ drop_video_id: coverPost.id, position: parkPosition })
      .eq('id', asset.id);
    if (parkErr) {
      return NextResponse.json({ error: parkErr.message }, { status: 500 });
    }
  }

  for (let i = 0; i < sortedAssets.length; i++) {
    const asset = sortedAssets[i];
    const { error: renumberErr } = await admin
      .from('content_drop_post_assets')
      .update({ position: i })
      .eq('id', asset.id);
    if (renumberErr) {
      return NextResponse.json({ error: renumberErr.message }, { status: 500 });
    }
  }

  // Now safe to delete source posts — their assets have already been moved.
  // ON DELETE CASCADE on drop_video_id is fine here because we already
  // re-pointed every asset to the cover post.
  if (sourcePosts.length > 0) {
    const { error: deleteErr } = await admin
      .from('content_drop_videos')
      .delete()
      .in(
        'id',
        sourcePosts.map((p) => p.id),
      );
    if (deleteErr) {
      return NextResponse.json({ error: deleteErr.message }, { status: 500 });
    }
  }

  // Update the drop's total post count to match the new shape.
  await admin
    .from('content_drops')
    .update({
      total_videos: await countDropPosts(admin, dropId),
      updated_at: new Date().toISOString(),
    })
    .eq('id', dropId);

  return NextResponse.json({
    ok: true,
    coverPostId: coverPost.id,
    deletedPostIds: sourcePosts.map((p) => p.id),
    assetCount: sortedAssets.length,
  });
}

async function countDropPosts(
  admin: ReturnType<typeof createAdminClient>,
  dropId: string,
): Promise<number> {
  const { count } = await admin
    .from('content_drop_videos')
    .select('id', { count: 'exact', head: true })
    .eq('drop_id', dropId);
  return count ?? 0;
}
