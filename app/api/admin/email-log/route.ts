import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/revenue/auth';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  source: z.enum(['all', 'campaign', 'onboarding']).default('all'),
  status: z.string().optional(),
  q: z.string().optional(),
  since: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

type EmailLogRow = {
  id: string;
  source: 'campaign' | 'onboarding';
  recipient: string;
  subject: string;
  status: string;
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  failure_reason: string | null;
  open_count: number;
  click_count: number;
  resend_id: string | null;
  type_hint: string | null;
  agency: string | null;
  sender_user_email: string | null;
  client_name: string | null;
  client_slug: string | null;
};

/**
 * Unified send log across every email path in Cortex:
 *   - email_messages: campaigns, sequences, reports, invites, one-off composer sends
 *   - onboarding_email_sends: ad-hoc sends from /admin/onboarding + invoice
 *     reminders + kickoff emails (these also land in email_messages via the
 *     webhook callback, but we surface them separately so admins can see the
 *     "what was attempted" record even when Resend hasn't webhooked back yet).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { admin } = auth;

  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { source, status, q, since, limit } = parsed.data;

  const rows: EmailLogRow[] = [];

  if (source === 'all' || source === 'campaign') {
    let qm = admin
      .from('email_messages')
      .select(
        'id, recipient_email, subject, status, sent_at, delivered_at, opened_at, clicked_at, bounced_at, failure_reason, open_count, click_count, resend_id, agency, metadata, created_at, created_by, users:created_by(email)',
      )
      .order('created_at', { ascending: false })
      .limit(limit);
    if (status) qm = qm.eq('status', status);
    if (since) qm = qm.gte('created_at', since);
    if (q) {
      qm = qm.or(`subject.ilike.%${q}%,recipient_email.ilike.%${q}%`);
    }
    const { data } = await qm;
    for (const m of data ?? []) {
      const meta = (m.metadata ?? {}) as Record<string, unknown>;
      rows.push({
        id: m.id,
        source: 'campaign',
        recipient: m.recipient_email,
        subject: m.subject,
        status: m.status,
        sent_at: m.sent_at,
        delivered_at: m.delivered_at,
        opened_at: m.opened_at,
        clicked_at: m.clicked_at,
        bounced_at: m.bounced_at,
        failure_reason: m.failure_reason,
        open_count: m.open_count ?? 0,
        click_count: m.click_count ?? 0,
        resend_id: m.resend_id,
        type_hint: (meta.type as string | undefined) ?? (meta.kind as string | undefined) ?? null,
        agency: m.agency,
        sender_user_email:
          (m.users as { email?: string | null } | null)?.email ?? null,
        client_name: null,
        client_slug: null,
      });
    }
  }

  if (source === 'all' || source === 'onboarding') {
    let qo = admin
      .from('onboarding_email_sends')
      .select(
        'id, to_email, subject, success, error, resend_id, sent_at, onboarding_trackers(client_id, clients(name, slug))',
      )
      .order('sent_at', { ascending: false })
      .limit(limit);
    if (since) qo = qo.gte('sent_at', since);
    if (q) qo = qo.or(`subject.ilike.%${q}%,to_email.ilike.%${q}%`);
    const { data } = await qo;
    for (const o of data ?? []) {
      const tracker = o.onboarding_trackers as {
        client_id?: string | null;
        clients?: { name?: string | null; slug?: string | null } | null;
      } | null;
      rows.push({
        id: o.id,
        source: 'onboarding',
        recipient: o.to_email,
        subject: o.subject,
        status: o.success ? 'sent' : 'failed',
        sent_at: o.sent_at,
        delivered_at: null,
        opened_at: null,
        clicked_at: null,
        bounced_at: null,
        failure_reason: o.error,
        open_count: 0,
        click_count: 0,
        resend_id: o.resend_id,
        type_hint: 'onboarding',
        agency: null,
        sender_user_email: null,
        client_name: tracker?.clients?.name ?? null,
        client_slug: tracker?.clients?.slug ?? null,
      });
    }
  }

  // Merge + sort by most recent timestamp, then slice to `limit`.
  rows.sort((a, b) => {
    const ta = new Date(a.sent_at ?? 0).getTime();
    const tb = new Date(b.sent_at ?? 0).getTime();
    return tb - ta;
  });

  // Surface counts by status so the UI can render a summary strip.
  const counts = {
    total: rows.length,
    sent: rows.filter((r) => r.status === 'sent').length,
    delivered: rows.filter((r) => r.status === 'delivered').length,
    opened: rows.filter((r) => r.opened_at !== null).length,
    bounced: rows.filter((r) => r.status === 'bounced').length,
    failed: rows.filter((r) => r.status === 'failed' || r.status === 'complained').length,
  };

  return NextResponse.json({ rows: rows.slice(0, limit), counts });
}
