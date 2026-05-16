import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminOnShare } from '@/lib/share/admin-gate';
import { logShareAdminAction } from '@/lib/share/audit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/calendar/share/[token]/comment/[commentId]/resolve
 *
 * PRD 06 §"Mark as revised". Admin closes a single revision row. We:
 *   1. Stamp `resolved_at = now()` on the targeted revision (and only
 *      that row, there is no bulk close-the-whole-post action).
 *   2. Insert a reply row with kind='video_revised' and the optional
 *      note as the body. Empty note still writes the reply so the
 *      audit trail stays consistent.
 *   3. Log a `revision.mark_revised` audit action.
 *
 * Replies live in the same review_link_id as their parent so the
 * thread renderer groups them naturally.
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
    .from('content_drop_share_links')
    .select('post_review_link_map')
    .eq('id', context.linkId)
    .single<{ post_review_link_map: Record<string, string> }>();
  if (!link) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const reviewLinkIds = new Set(Object.values(link.post_review_link_map ?? {}));

  const { data: target } = await admin
    .from('post_review_comments')
    .select('id, review_link_id, kind, resolved_at')
    .eq('id', commentId)
    .maybeSingle<{
      id: string;
      review_link_id: string;
      kind: string;
      resolved_at: string | null;
    }>();
  if (!target || !reviewLinkIds.has(target.review_link_id)) {
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
    .from('post_review_comments')
    .insert({
      review_link_id: target.review_link_id,
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
    .from('post_review_comments')
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
    shareLinkKind: 'calendar',
    actorUserId: identity.userId,
    action: 'revision.mark_revised',
    targetKind: 'revision',
    targetId: target.id,
    payload: { reply_id: reply.id, has_note: note.length > 0 },
  });

  return NextResponse.json({ ok: true, reply_id: reply.id });
}
