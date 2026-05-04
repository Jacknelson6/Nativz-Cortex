import { NextRequest, NextResponse } from 'next/server';
import { syncRecent } from '@/lib/stripe/backfill';
import { createAdminClient } from '@/lib/supabase/admin';
import { onInvoiceOverdue, onInvoiceDueSoon, logLifecycleEvent } from '@/lib/lifecycle/state-machine';
import { notifyAdmins } from '@/lib/lifecycle/notify';
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

  const dueSoonHorizon = new Date(Date.now() + 3 * 86400_000).toISOString();
  const { data: dueSoon } = await admin
    .from('stripe_invoices')
    .select('id, client_id, number, amount_paid_cents, amount_due_cents, amount_remaining_cents, currency, hosted_invoice_url, status, due_date')
    .eq('status', 'open')
    .gte('due_date', nowIso)
    .lte('due_date', dueSoonHorizon)
    .limit(200);

  let dueSoonNotifications = 0;
  for (const inv of dueSoon ?? []) {
    const { data: recent } = await admin
      .from('client_lifecycle_events')
      .select('id')
      .contains('metadata', { invoice_id: inv.id, kind: 'due_soon' })
      .gte('occurred_at', new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString())
      .limit(1);
    if (recent && recent.length > 0) continue;

    await onInvoiceDueSoon(
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
    dueSoonNotifications += 1;
  }

  const { data: clientsWithMrr } = await admin
    .from('clients')
    .select('id')
    .not('stripe_customer_id', 'is', null);
  for (const c of clientsWithMrr ?? []) {
    await recomputeClientMrr(c.id, admin);
  }

  // Bug 5: auto-expire proposals past their expires_at so MRR + the
  // admin proposals list stay honest. Public proposal surface lives
  // externally (docs.nativz.io) — only the row state matters here.
  const { data: freshlyExpired } = await admin
    .from('proposals')
    .update({ status: 'expired' })
    .in('status', ['sent', 'viewed'])
    .lt('expires_at', nowIso)
    .select('id, title, client_id, slug');

  let proposalsExpired = 0;
  for (const p of freshlyExpired ?? []) {
    proposalsExpired += 1;
    if (p.client_id) {
      await logLifecycleEvent(p.client_id, 'proposal.expired', `Proposal expired: ${p.title}`, {
        metadata: { proposal_id: p.id, slug: p.slug },
        admin,
      });
    }
    await admin.from('proposal_events').insert({
      proposal_id: p.id,
      type: 'expired',
      metadata: { auto: true },
    });
  }

  // Bug 5 (cont.): two-day pre-expiry warning — one notification per
  // proposal, deduped via proposal_events so the cron running daily doesn't
  // re-notify. Open: proposals in 'sent'/'viewed', expires within 48h.
  const warningHorizon = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const { data: expiringSoon } = await admin
    .from('proposals')
    .select('id, title, client_id, slug, signer_email, expires_at')
    .in('status', ['sent', 'viewed'])
    .gte('expires_at', nowIso)
    .lte('expires_at', warningHorizon)
    .limit(100);

  let proposalExpiryWarnings = 0;
  for (const p of expiringSoon ?? []) {
    const { data: existing } = await admin
      .from('proposal_events')
      .select('id')
      .eq('proposal_id', p.id)
      .eq('type', 'expiring_soon')
      .limit(1);
    if (existing && existing.length > 0) continue;
    await admin.from('proposal_events').insert({
      proposal_id: p.id,
      type: 'expiring_soon',
      metadata: { expires_at: p.expires_at },
    });
    await notifyAdmins(
      admin,
      'proposal_expiring',
      `Proposal expiring soon: ${p.title}`,
      { message: `Expires ${new Date(p.expires_at!).toLocaleDateString('en-US')} — nudge ${p.signer_email ?? 'signer'}?` },
    );
    proposalExpiryWarnings += 1;
  }

  return NextResponse.json({
    ok: true,
    recent: recentCounts,
    overdueNotifications,
    dueSoonNotifications,
    mrrRecomputed: clientsWithMrr?.length ?? 0,
    proposalsExpired,
    proposalExpiryWarnings,
  });
}
