import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

type AdminClient = SupabaseClient;

export async function upsertInvoiceFromStripe(
  invoice: Stripe.Invoice,
  admin: AdminClient = createAdminClient(),
): Promise<{ id: string; client_id: string | null; previous_status: string | null; current_status: string }> {
  const customerId =
    typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id ?? null;
  const rawSub = (invoice as unknown as { subscription?: string | { id: string } | null }).subscription;
  const subscriptionId = typeof rawSub === 'string' ? rawSub : rawSub?.id ?? null;

  const clientId = await resolveClientIdForCustomer(customerId, admin);

  const { data: existing } = await admin
    .from('stripe_invoices')
    .select('status')
    .eq('id', invoice.id)
    .maybeSingle();

  const row = {
    id: invoice.id,
    customer_id: customerId,
    client_id: clientId,
    number: invoice.number ?? null,
    status: invoice.status ?? 'draft',
    amount_due_cents: invoice.amount_due ?? 0,
    amount_paid_cents: invoice.amount_paid ?? 0,
    amount_remaining_cents: invoice.amount_remaining ?? 0,
    currency: invoice.currency ?? 'usd',
    subscription_id: subscriptionId,
    hosted_invoice_url: invoice.hosted_invoice_url ?? null,
    invoice_pdf: invoice.invoice_pdf ?? null,
    due_date: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null,
    finalized_at: invoice.status_transitions?.finalized_at
      ? new Date(invoice.status_transitions.finalized_at * 1000).toISOString()
      : null,
    paid_at: invoice.status_transitions?.paid_at
      ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
      : null,
    voided_at: invoice.status_transitions?.voided_at
      ? new Date(invoice.status_transitions.voided_at * 1000).toISOString()
      : null,
    attempt_count: invoice.attempt_count ?? 0,
    metadata: invoice.metadata ?? {},
    livemode: invoice.livemode,
    created_at: invoice.created ? new Date(invoice.created * 1000).toISOString() : null,
    synced_at: new Date().toISOString(),
  };

  const { error } = await admin.from('stripe_invoices').upsert(row, { onConflict: 'id' });
  if (error) throw new Error(`upsertInvoiceFromStripe: ${error.message}`);

  return {
    id: invoice.id,
    client_id: clientId,
    previous_status: existing?.status ?? null,
    current_status: row.status,
  };
}

async function resolveClientIdForCustomer(
  customerId: string | null,
  admin: AdminClient,
): Promise<string | null> {
  if (!customerId) return null;
  const { data } = await admin
    .from('stripe_customers')
    .select('client_id')
    .eq('id', customerId)
    .maybeSingle();
  return data?.client_id ?? null;
}
