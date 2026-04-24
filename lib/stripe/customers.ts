import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

type AdminClient = SupabaseClient;

/**
 * Upserts a Stripe customer into `stripe_customers` and tries to link it to a
 * `clients.id` by matching email (case-insensitive). Returns the resolved
 * `client_id` (or null if no match).
 */
export async function upsertCustomerFromStripe(
  customer: Stripe.Customer | Stripe.DeletedCustomer,
  admin: AdminClient = createAdminClient(),
): Promise<{ id: string; client_id: string | null }> {
  if (customer.deleted) {
    await admin
      .from('stripe_customers')
      .update({ deleted: true, synced_at: new Date().toISOString() })
      .eq('id', customer.id);
    return { id: customer.id, client_id: null };
  }

  const c = customer as Stripe.Customer;
  const clientId = await resolveClientIdFromCustomer(c, admin);

  const row = {
    id: c.id,
    client_id: clientId,
    email: c.email ?? null,
    name: c.name ?? null,
    metadata: c.metadata ?? {},
    livemode: c.livemode,
    created_at: new Date(c.created * 1000).toISOString(),
    synced_at: new Date().toISOString(),
    deleted: false,
  };

  const { error } = await admin.from('stripe_customers').upsert(row, { onConflict: 'id' });
  if (error) throw new Error(`upsertCustomerFromStripe: ${error.message}`);

  if (clientId) {
    await admin
      .from('clients')
      .update({ stripe_customer_id: c.id })
      .eq('id', clientId)
      .is('stripe_customer_id', null);
  }

  return { id: c.id, client_id: clientId };
}

async function resolveClientIdFromCustomer(
  c: Stripe.Customer,
  admin: AdminClient,
): Promise<string | null> {
  const metaClientId = (c.metadata?.client_id ?? c.metadata?.cortex_client_id) as string | undefined;
  if (metaClientId) {
    const { data } = await admin.from('clients').select('id').eq('id', metaClientId).maybeSingle();
    if (data?.id) return data.id;
  }

  const { data: existing } = await admin
    .from('clients')
    .select('id')
    .eq('stripe_customer_id', c.id)
    .maybeSingle();
  if (existing?.id) return existing.id;

  if (c.email) {
    const { data: byEmail } = await admin
      .from('clients')
      .select('id')
      .ilike('name', c.name ?? '%__never__%')
      .limit(1);
    if (byEmail && byEmail.length === 1) return byEmail[0].id;

    const { data: clientContacts } = await admin
      .from('client_contacts')
      .select('client_id')
      .ilike('email', c.email)
      .limit(1);
    if (clientContacts && clientContacts.length === 1) return clientContacts[0].client_id;
  }

  return null;
}
