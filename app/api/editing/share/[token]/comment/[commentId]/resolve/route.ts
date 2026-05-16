import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminOnShare } from '@/lib/share/admin-gate';
import { logShareAdminAction } from '@/lib/share/audit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/editing/share/[token]/comment/[commentId]/resolve
 *
 * PRD 06 §"Mark as revised", editing variant. Same shape as the
 * calendar route: closes a single revision row, inserts a
 * `video_revised` reply (with optional note), audits the action.
 */

const Body = z.object({
  note: z.string().max(2000).optional(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string; commentId: string }> },
) {
  const { token, commentId } = await ctx.params;

  const gate = await requireAdminOnShare(token);
  if (!gate.ok) return gate.response;
  const { context, identity } = gate;

  const json = (await req.json().catch(() => ({}))) as unknown;
  const parsed = Body.safeParse(json ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'bad_request', detail: parsed.error.message },
      { status: 400 },
    );
  }
  const note = (parsed.data.note ?? '').trim();

  const admin = createAdminClient();
  const { data: link } = await admin
    .from('editing_project_share_links')
    .select('project_id')
    .eq('id', context.linkId)
    .single<{ project_id: string }>();
  if (!link) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const { data: target } = await admin
    .from('editing_project_review_comments')
    .select('id, project_id, video_id, kind, resolved_at, share_link_id')
    .eq('id', commentId)
    .maybeSingle<{
      id: string;
      project_id: string;
      video_id: string | null;
      kind: string;
      resolved_at: string | null;
      share_link_id: string | null;
    }>();
  if (!target || target.project_id !== link.project_id) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (target.kind !== 'revision') {
    return NextResponse.json(
      { error: 'only revision comments can be marked revised' },
      { status: 400 },
    );
  }
  if (target.resolved_at) {
    return NextResponse.json({ ok: true, already_resolved: true });
  }

  const editorName = identity.displayName || identity.email || 'Editor';

  const { data: reply, error: replyErr } = await admin
    .from('editing_project_review_comments')
    .insert({
      project_id: target.project_id,
      video_id: target.video_id,
      share_link_id: target.share_link_id ?? context.linkId,
      parent_comment_id: target.id,
      author_name: editorName,
      author_user_id: identity.userId,
      author_role: 'admin',
      content: note,
      status: 'video_revised',
      kind: 'video_revised',
      attachments: [],
    })
    .select('id, created_at')
    .single<{ id: string; created_at: string }>();
  if (replyErr) {
    return NextResponse.json(
      { error: 'reply_insert_failed', detail: replyErr.message },
      { status: 500 },
    );
  }

  const { error: updErr } = await admin
    .from('editing_project_review_comments')
    .update({ resolved_at: new Date().toISOString() })
    .eq('id', target.id);
  if (updErr) {
    return NextResponse.json(
      { error: 'resolve_failed', detail: updErr.message },
      { status: 500 },
    );
  }

  await logShareAdminAction({
    shareLinkId: context.linkId,
    shareLinkKind: 'editing',
    actorUserId: identity.userId,
    action: 'revision.mark_revised',
    targetKind: 'revision',
    targetId: target.id,
    payload: { reply_id: reply.id, has_note: note.length > 0 },
  });

  return NextResponse.json({ ok: true, reply_id: reply.id });
}
