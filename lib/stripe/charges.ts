import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

type AdminClient = SupabaseClient;

export async function upsertChargeFromStripe(
  charge: Stripe.Charge,
  admin: AdminClient = createAdminClient(),
): Promise<{ id: string; client_id: string | null }> {
  const customerId = typeof charge.customer === 'string' ? charge.customer : charge.customer?.id ?? null;
  const rawInvoice = (charge as unknown as { invoice?: string | { id: string } | null }).invoice;
  const invoiceId = typeof rawInvoice === 'string' ? rawInvoice : rawInvoice?.id ?? null;

  let clientId: string | null = null;
  if (customerId) {
    const { data } = await admin
      .from('stripe_customers')
      .select('client_id')
      .eq('id', customerId)
      .maybeSingle();
    clientId = data?.client_id ?? null;
  }

  const row = {
    id: charge.id,
    customer_id: customerId,
    client_id: clientId,
    invoice_id: invoiceId,
    amount_cents: charge.amount ?? 0,
    amount_refunded_cents: charge.amount_refunded ?? 0,
    currency: charge.currency ?? 'usd',
    status: charge.status,
    paid: charge.paid,
    refunded: charge.refunded,
    failure_code: charge.failure_code ?? null,
    failure_message: charge.failure_message ?? null,
    metadata: charge.metadata ?? {},
    livemode: charge.livemode,
    created_at: charge.created ? new Date(charge.created * 1000).toISOString() : null,
    synced_at: new Date().toISOString(),
  };

  const { error } = await admin.from('stripe_charges').upsert(row, { onConflict: 'id' });
  if (error) throw new Error(`upsertChargeFromStripe: ${error.message}`);

  return { id: charge.id, client_id: clientId };
}
