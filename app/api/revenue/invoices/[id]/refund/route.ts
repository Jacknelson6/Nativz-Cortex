import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/revenue/auth';
import { getStripe } from '@/lib/stripe/client';
import { upsertRefundFromStripe } from '@/lib/stripe/refunds';
import { logLifecycleEvent } from '@/lib/lifecycle/state-machine';
import { dollarsToCents, formatCents } from '@/lib/format/money';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  amount_dollars: z.union([z.number(), z.string()]).optional(),
  reason: z.enum(['duplicate', 'fraudulent', 'requested_by_customer']).optional(),
  note: z.string().max(500).optional(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { admin, userId } = auth;

  const { id: invoiceId } = await ctx.params;
  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw ?? {});
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const { data: invoice } = await admin
    .from('stripe_invoices')
    .select('id, client_id, number, status, currency, amount_paid_cents')
    .eq('id', invoiceId)
    .maybeSingle();
  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  if (invoice.status !== 'paid') {
    return NextResponse.json({ error: 'Only paid invoices can be refunded' }, { status: 400 });
  }

  const { data: charges } = await admin
    .from('stripe_charges')
    .select('id, amount_cents, amount_refunded_cents, status, paid')
    .eq('invoice_id', invoiceId)
    .eq('paid', true)
    .order('created_at', { ascending: false });
  const primary = (charges ?? []).find((c) => c.status === 'succeeded') ?? charges?.[0];
  if (!primary) {
    return NextResponse.json(
      { error: 'No successful charge found to refund against.' },
      { status: 400 },
    );
  }

  const refundableCents = (primary.amount_cents ?? 0) - (primary.amount_refunded_cents ?? 0);
  if (refundableCents <= 0) {
    return NextResponse.json({ error: 'Charge already fully refunded' }, { status: 400 });
  }

  const requested =
    parsed.data.amount_dollars !== undefined
      ? dollarsToCents(parsed.data.amount_dollars as number)
      : refundableCents;
  if (requested <= 0 || requested > refundableCents) {
    return NextResponse.json({ error: 'Invalid refund amount' }, { status: 400 });
  }

  const stripe = getStripe();
  let refund;
  try {
    refund = await stripe.refunds.create({
      charge: primary.id,
      amount: requested,
      reason: parsed.data.reason,
      metadata: parsed.data.note ? { note: parsed.data.note, actor: userId } : { actor: userId },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Stripe refund failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  await upsertRefundFromStripe(refund, admin);

  if (invoice.client_id) {
    await logLifecycleEvent(
      invoice.client_id,
      'invoice.voided',
      `Refund issued on invoice ${invoice.number ?? ''} — ${formatCents(requested, invoice.currency)}`,
      {
        description: parsed.data.note ?? undefined,
        metadata: { invoice_id: invoice.id, refund_id: refund.id, charge_id: primary.id },
        actorUserId: userId,
        admin,
      },
    );
  }

  return NextResponse.json({ ok: true, refund_id: refund.id, amount_cents: requested });
}
