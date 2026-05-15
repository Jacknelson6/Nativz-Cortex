import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminOnShare } from '@/lib/share/admin-gate';
import { logShareAdminAction } from '@/lib/share/audit';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/editing/share/[token]/video/[videoId]
 *
 * PRD 06: admin-only soft-delete of an editing video tile from the
 * share-link visible set. Stamps `archived_at` + `archived_by` on the
 * row; the share GET filters on `archived_at IS NULL` after migration
 * 320 lands. Underlying Mux asset stays — we only hide the row.
 */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ token: string; videoId: string }> },
) {
  const { token, videoId } = await ctx.params;

  const gate = await requireAdminOnShare(token);
  if (!gate.ok) return gate.response;
  const { context, identity } = gate;

  const admin = createAdminClient();

  // Confirm the video belongs to the project the share link points at,
  // so an admin from agency A on link X can't reach into agency B's
  // unrelated video by id-swapping. The gate already proves they have
  // admin rights in agency A; this anchors the targetId to the link.
  const { data: link } = await admin
    .from('editing_project_share_links')
    .select('project_id')
    .eq('id', context.linkId)
    .single<{ project_id: string }>();
  if (!link) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const { data: video } = await admin
    .from('editing_project_videos')
    .select('id, project_id, archived_at')
    .eq('id', videoId)
    .maybeSingle<{ id: string; project_id: string; archived_at: string | null }>();
  if (!video || video.project_id !== link.project_id) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (video.archived_at) {
    return NextResponse.json({ ok: true, already_archived: true });
  }

  const { error: updErr } = await admin
    .from('editing_project_videos')
    .update({
      archived_at: new Date().toISOString(),
      archived_by: identity.userId,
    })
    .eq('id', videoId);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  await logShareAdminAction({
    shareLinkId: context.linkId,
    shareLinkKind: 'editing',
    actorUserId: identity.userId,
    action: 'video.delete',
    targetKind: 'video',
    targetId: videoId,
    payload: {},
  });

  return NextResponse.json({ ok: true });
}
