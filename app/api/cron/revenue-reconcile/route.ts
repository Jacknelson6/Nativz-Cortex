import { NextRequest, NextResponse } from 'next/server';
import { syncRecent } from '@/lib/stripe/backfill';
import { createAdminClient } from '@/lib/supabase/admin';
import { onInvoiceOverdue } from '@/lib/lifecycle/state-machine';
import { recomputeClientMrr } from '@/lib/stripe/subscriptions';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const recentCounts = await syncRecent(48 * 60 * 60);

  const nowIso = new Date().toISOString();
  const { data: overdue } = await admin
    .from('stripe_invoices')
    .select('id, client_id, number, amount_paid_cents, amount_due_cents, amount_remaining_cents, currency, hosted_invoice_url, status, due_date')
    .eq('status', 'open')
    .lt('due_date', nowIso)
    .limit(200);

  let overdueNotifications = 0;
  for (const inv of overdue ?? []) {
    const { data: recent } = await admin
      .from('client_lifecycle_events')
      .select('id')
      .eq('type', 'invoice.overdue')
      .contains('metadata', { invoice_id: inv.id })
      .gte('occurred_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(1);
    if (recent && recent.length > 0) continue;

    await onInvoiceOverdue(
      {
        id: inv.id,
        client_id: inv.client_id,
        number: inv.number,
        amount_paid_cents: inv.amount_paid_cents,
        amount_due_cents: inv.amount_due_cents,
        currency: inv.currency,
        hosted_invoice_url: inv.hosted_invoice_url,
        status: inv.status,
      },
      admin,
    );
    overdueNotifications += 1;
  }

  const { data: clientsWithMrr } = await admin
    .from('clients')
    .select('id')
    .not('stripe_customer_id', 'is', null);
  for (const c of clientsWithMrr ?? []) {
    await recomputeClientMrr(c.id, admin);
  }

  return NextResponse.json({
    ok: true,
    recent: recentCounts,
    overdueNotifications,
    mrrRecomputed: clientsWithMrr?.length ?? 0,
  });
}
