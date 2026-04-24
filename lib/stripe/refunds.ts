import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

type AdminClient = SupabaseClient;

export async function upsertRefundFromStripe(
  refund: Stripe.Refund,
  admin: AdminClient = createAdminClient(),
): Promise<{ id: string; client_id: string | null }> {
  const chargeId = typeof refund.charge === 'string' ? refund.charge : refund.charge?.id ?? null;

  let clientId: string | null = null;
  let customerId: string | null = null;
  let invoiceId: string | null = null;

  if (chargeId) {
    const { data: charge } = await admin
      .from('stripe_charges')
      .select('client_id, customer_id, invoice_id')
      .eq('id', chargeId)
      .maybeSingle();
    clientId = charge?.client_id ?? null;
    customerId = charge?.customer_id ?? null;
    invoiceId = charge?.invoice_id ?? null;
  }

  const row = {
    id: refund.id,
    charge_id: chargeId,
    invoice_id: invoiceId,
    customer_id: customerId,
    client_id: clientId,
    amount_cents: refund.amount ?? 0,
    currency: refund.currency ?? 'usd',
    reason: refund.reason ?? null,
    status: refund.status ?? 'unknown',
    created_at: refund.created ? new Date(refund.created * 1000).toISOString() : null,
    synced_at: new Date().toISOString(),
    metadata: refund.metadata ?? {},
    livemode: (refund as unknown as { livemode?: boolean }).livemode ?? false,
  };

  const { error } = await admin.from('stripe_refunds').upsert(row, { onConflict: 'id' });
  if (error) throw new Error(`upsertRefundFromStripe: ${error.message}`);

  if (chargeId) {
    const { data: sumRow } = await admin
      .from('stripe_refunds')
      .select('amount_cents')
      .eq('charge_id', chargeId);
    const total = (sumRow ?? []).reduce((s, r) => s + (r.amount_cents ?? 0), 0);
    await admin
      .from('stripe_charges')
      .update({
        amount_refunded_cents: total,
        refunded: total > 0,
        synced_at: new Date().toISOString(),
      })
      .eq('id', chargeId);
  }

  return { id: refund.id, client_id: clientId };
}
