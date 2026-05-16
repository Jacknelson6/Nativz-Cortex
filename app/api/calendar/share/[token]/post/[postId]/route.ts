import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminOnShare } from '@/lib/share/admin-gate';
import { logShareAdminAction } from '@/lib/share/audit';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/calendar/share/[token]/post/[postId]
 *
 * PRD 06: admin-only soft-delete from a share link's visible set.
 * The underlying `content_drops` row + `scheduled_posts` row stay
 * intact, we only mutate the link's `included_post_ids` array and
 * scrub the matching key from `post_review_link_map`. Same post can
 * still appear on sibling share links untouched.
 *
 * Hard rule per CLAUDE.md "unapproved drop posts MUST NEVER publish":
 * if the post is unapproved and scheduled in the future, we also clear
 * its scheduled_at so removing it from the share-link surface cannot
 * leave a ghost publish queued.
 */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ token: string; postId: string }> },
) {
  const { token, postId } = await ctx.params;

  const gate = await requireAdminOnShare(token);
  if (!gate.ok) return gate.response;
  const { context, identity } = gate;

  const admin = createAdminClient();
  const { data: link } = await admin
    .from('content_drop_share_links')
    .select('id, included_post_ids, post_review_link_map')
    .eq('id', context.linkId)
    .single<{
      id: string;
      included_post_ids: string[];
      post_review_link_map: Record<string, string>;
    }>();
  if (!link) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!link.included_post_ids?.includes(postId)) {
    return NextResponse.json(
      { error: 'post is not part of this share link' },
      { status: 400 },
    );
  }

  const nextIds = link.included_post_ids.filter((id) => id !== postId);
  const nextMap = { ...(link.post_review_link_map ?? {}) };
  const removedReviewLinkId = nextMap[postId];
  delete nextMap[postId];

  const { error: updErr } = await admin
    .from('content_drop_share_links')
    .update({
      included_post_ids: nextIds,
      post_review_link_map: nextMap,
    })
    .eq('id', link.id);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  // Standing invariant: an unapproved post that's still scheduled cannot
  // be allowed to publish. Pull its current state and clear scheduled_at
  // if it's both future-dated and not approved. We do NOT touch approved
  // posts, those are still active on whatever other share links carry
  // them, and the operator's intent is "hide from this link," not "kill
  // the publish."
  const { data: post } = await admin
    .from('scheduled_posts')
    .select('id, scheduled_at, status')
    .eq('id', postId)
    .maybeSingle<{ id: string; scheduled_at: string | null; status: string | null }>();
  let clearedSchedule = false;
  if (
    post &&
    post.status !== 'approved' &&
    post.scheduled_at &&
    new Date(post.scheduled_at).getTime() > Date.now()
  ) {
    await admin
      .from('scheduled_posts')
      .update({ scheduled_at: null, status: 'draft' })
      .eq('id', postId);
    clearedSchedule = true;
  }

  await logShareAdminAction({
    shareLinkId: context.linkId,
    shareLinkKind: 'calendar',
    actorUserId: identity.userId,
    action: 'post.delete',
    targetKind: 'post',
    targetId: postId,
    payload: {
      removed_review_link_id: removedReviewLinkId ?? null,
      cleared_schedule: clearedSchedule,
    },
  });

  return NextResponse.json({ ok: true, cleared_schedule: clearedSchedule });
}
