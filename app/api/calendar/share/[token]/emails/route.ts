import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';

/**
 * GET /api/calendar/share/[token]/emails
 *   Admin-only. Reads the `share_link_emails` archive for the share link
 *   identified by `token`, newest first. The unified review modal calls
 *   this to render its "touchpoint history" + "open last email" surfaces
 *   without rebuilding the rendered HTML on the fly.
 */

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
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ error: 'admin only' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: link } = await admin
    .from('content_drop_share_links')
    .select('id')
    .eq('token', token)
    .single<{ id: string }>();
  if (!link) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const { data: rows, error } = await admin
    .from('share_link_emails')
    .select('id, kind, subject, html_body, plain_body, recipients, sent_by, sent_at')
    .eq('share_link_id', link.id)
    .order('sent_at', { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Resolve sender labels in one shot. The archive only stores user IDs so
  // the modal stays decoupled from the team-members table; we hydrate names
  // here to keep the response self-sufficient.
  const senderIds = Array.from(
    new Set((rows ?? []).map((r) => r.sent_by).filter((id): id is string => !!id)),
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
