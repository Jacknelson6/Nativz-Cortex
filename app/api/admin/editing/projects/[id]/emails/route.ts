import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';

/**
 * GET /api/admin/editing/projects/:id/emails
 *   Admin-only. Aggregates `editing_share_link_emails` rows across every
 *   share link the project has minted (active or archived), newest first.
 *   The unified review modal calls this so "Past emails" survives a
 *   link archive + remint cycle without losing history.
 *
 *   Mirrors the SMM reader at `/api/calendar/share/[token]/emails` so the
 *   modals render identical-shape data; the editing surface just keys by
 *   project id rather than a single token because a project can have
 *   multiple share links over its lifetime.
 */

export const dynamic = 'force-dynamic';

interface ArchivedRecipient {
  email: string;
  name?: string | null;
}

interface SenderRow {
  full_name: string | null;
  email: string | null;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ error: 'admin only' }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data: links } = await admin
    .from('editing_project_share_links')
    .select('id')
    .eq('project_id', id)
    .returns<Array<{ id: string }>>();

  const linkIds = (links ?? []).map((l) => l.id);
  if (linkIds.length === 0) {
    return NextResponse.json({ emails: [] });
  }

  const { data: rows, error } = await admin
    .from('editing_share_link_emails')
    .select('id, kind, subject, html_body, plain_body, recipients, sent_by, sent_at')
    .in('share_link_id', linkIds)
    .order('sent_at', { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const senderIds = Array.from(
    new Set((rows ?? []).map((r) => r.sent_by).filter((sid): sid is string => !!sid)),
  );
  const senderMap = new Map<string, string>();
  if (senderIds.length > 0) {
    const { data: senders } = await admin
      .from('users')
      .select('id, full_name, email')
      .in('id', senderIds)
      .returns<Array<{ id: string } & SenderRow>>();
    for (const s of senders ?? []) {
      const label = s.full_name?.trim() || s.email?.split('@')[0] || 'Admin';
      senderMap.set(s.id, label);
    }
  }

  const emails = (rows ?? []).map((r) => ({
    id: r.id as string,
    kind: r.kind as string,
    subject: r.subject as string,
    html_body: r.html_body as string,
    plain_body: (r.plain_body as string | null) ?? null,
    recipients: (r.recipients as ArchivedRecipient[] | null) ?? [],
    sent_by: (r.sent_by as string | null) ?? null,
    sent_by_label: r.sent_by ? senderMap.get(r.sent_by) ?? 'Admin' : null,
    sent_at: r.sent_at as string,
  }));

  return NextResponse.json({ emails });
}
