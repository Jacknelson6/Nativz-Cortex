import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/content-tools/email-activity
 *
 * Returns the last N transactional emails sent by the content
 * pipeline (calendar share, followups, revisions, comment digests,
 * final-call nudges, reminders). Powers the Notifications tab on
 * /admin/content-tools.
 *
 * Filtered to type keys we actually want to surface here -- e.g. one-
 * off team notifications and password-reset transactional emails are
 * intentionally out of scope. This page is "what the content pipeline
 * just told a client", not a full email log.
 *
 * Brand display names are looked up in a follow-up batch query so we
 * can show "Nike, May 2026 Calendar share -> Aaron Carter" instead of
 * a bare client_id.
 */

const CALENDAR_TYPE_KEYS = [
  'calendar_share',
  'calendar_followup',
  'calendar_final_call',
  'calendar_revisions',
  'calendar_comment_digest',
  'calendar_reminder',
] as const;

interface EmailRow {
  id: string;
  type_key: string;
  subject: string | null;
  recipient_email: string | null;
  cc: string[] | null;
  client_id: string | null;
  status: string | null;
  sent_at: string | null;
  created_at: string;
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ error: 'admin only' }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data: emails } = await admin
    .from('email_messages')
    .select(
      'id, type_key, subject, recipient_email, cc, client_id, status, sent_at, created_at',
    )
    .in('type_key', CALENDAR_TYPE_KEYS as unknown as string[])
    .order('created_at', { ascending: false })
    .limit(40)
    .returns<EmailRow[]>();

  const list = emails ?? [];

  const clientIds = Array.from(
    new Set(list.map((e) => e.client_id).filter((id): id is string => !!id)),
  );

  let clientById = new Map<string, string>();
  if (clientIds.length > 0) {
    const { data: clients } = await admin
      .from('clients')
      .select('id, name')
      .in('id', clientIds);
    clientById = new Map((clients ?? []).map((c) => [c.id, c.name]));
  }

  const rows = list.map((e) => ({
    id: e.id,
    typeKey: e.type_key,
    subject: e.subject ?? '',
    to: dedupeRecipients(e.recipient_email, e.cc),
    clientName: e.client_id ? clientById.get(e.client_id) ?? null : null,
    sentAt: e.sent_at ?? e.created_at,
    status: e.status ?? 'sent',
  }));

  return NextResponse.json({ rows });
}

function dedupeRecipients(
  primary: string | null,
  cc: string[] | null,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  if (primary && !seen.has(primary)) {
    seen.add(primary);
    out.push(primary);
  }
  for (const addr of cc ?? []) {
    if (!addr || seen.has(addr)) continue;
    seen.add(addr);
    out.push(addr);
  }
  return out;
}
