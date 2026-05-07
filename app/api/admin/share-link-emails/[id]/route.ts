import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/share-link-emails/:id
 *
 * Fetch a single archived share-link email by id. The history tab in
 * the calendar review modal feeds events for the whole drop, which can
 * include emails from re-minted share links. The dialog's "Past emails"
 * panel only loads the current link's archive, so a click on a row from
 * a sibling link needs a per-id lookup to render the replay.
 */

interface ArchivedRecipient {
  email: string;
  name?: string | null;
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
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: row } = await admin
    .from('share_link_emails')
    .select('id, kind, subject, html_body, plain_body, recipients, sent_by, sent_at')
    .eq('id', id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  let sent_by_label: string | null = null;
  if (row.sent_by) {
    const { data: sender } = await admin
      .from('users')
      .select('full_name, email')
      .eq('id', row.sent_by)
      .maybeSingle<{ full_name: string | null; email: string | null }>();
    if (sender) {
      sent_by_label =
        sender.full_name?.trim() || sender.email?.split('@')[0] || 'Admin';
    }
  }

  return NextResponse.json({
    email: {
      id: row.id as string,
      kind: row.kind as string,
      subject: row.subject as string,
      html_body: row.html_body as string,
      plain_body: (row.plain_body as string | null) ?? null,
      recipients: (row.recipients as ArchivedRecipient[] | null) ?? [],
      sent_by: (row.sent_by as string | null) ?? null,
      sent_by_label,
      sent_at: row.sent_at as string,
    },
  });
}
