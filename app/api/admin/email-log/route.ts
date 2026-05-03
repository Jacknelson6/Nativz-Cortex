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
 * Unified send log across every email path in Cortex. Everything now lands in
 * `email_messages` (campaigns, sequences, reports, invites, one-off composer
 * sends, onboarding welcomes + nudges via `sendAndLog`). The "onboarding" vs
 * "campaign" split is a UI filter on `metadata.onboarding_id` rather than a
 * separate table, since the legacy `onboarding_email_sends` log is gone.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { admin } = auth;

  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { source, status, q, since, limit } = parsed.data;

  let qm = admin
    .from('email_messages')
    .select(
      'id, recipient_email, subject, status, sent_at, delivered_at, opened_at, clicked_at, bounced_at, failure_reason, open_count, click_count, resend_id, agency, metadata, created_at, created_by, users:created_by(email)',
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) qm = qm.eq('status', status);
  if (since) qm = qm.gte('created_at', since);
  if (q) qm = qm.or(`subject.ilike.%${q}%,recipient_email.ilike.%${q}%`);
  if (source === 'campaign') qm = qm.is('metadata->>onboarding_id', null);
  if (source === 'onboarding') qm = qm.not('metadata->>onboarding_id', 'is', null);

  const { data: messages } = await qm;

  // Resolve client name/slug for onboarding rows in a single batched lookup.
  const onboardingIds = new Set<string>();
  for (const m of messages ?? []) {
    const meta = (m.metadata ?? {}) as Record<string, unknown>;
    const oid = meta.onboarding_id;
    if (typeof oid === 'string' && oid) onboardingIds.add(oid);
  }

  const clientByOnboardingId = new Map<string, { name: string | null; slug: string | null }>();
  if (onboardingIds.size > 0) {
    const { data: onboardings } = await admin
      .from('onboardings')
      .select('id, clients(name, slug)')
      .in('id', Array.from(onboardingIds));
    for (const o of onboardings ?? []) {
      const c = (o.clients ?? null) as { name?: string | null; slug?: string | null } | null;
      clientByOnboardingId.set(o.id as string, {
        name: c?.name ?? null,
        slug: c?.slug ?? null,
      });
    }
  }

  const rows: EmailLogRow[] = [];
  for (const m of messages ?? []) {
    const meta = (m.metadata ?? {}) as Record<string, unknown>;
    const oid = typeof meta.onboarding_id === 'string' ? meta.onboarding_id : null;
    const client = oid ? clientByOnboardingId.get(oid) ?? null : null;
    const isOnboarding = oid !== null;
    rows.push({
      id: m.id,
      source: isOnboarding ? 'onboarding' : 'campaign',
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
      type_hint:
        (meta.type as string | undefined) ??
        (meta.kind as string | undefined) ??
        (isOnboarding ? 'onboarding' : null),
      agency: m.agency,
      sender_user_email:
        (m.users as { email?: string | null } | null)?.email ?? null,
      client_name: client?.name ?? null,
      client_slug: client?.slug ?? null,
    });
  }

  // Sort by most recent timestamp, then slice to `limit`.
  rows.sort((a, b) => {
    const ta = new Date(a.sent_at ?? 0).getTime();
    const tb = new Date(b.sent_at ?? 0).getTime();
    return tb - ta;
  });

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
