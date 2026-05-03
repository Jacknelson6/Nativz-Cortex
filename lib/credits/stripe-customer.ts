/**
 * ensureStripeCustomer — first-time customer onboarding for the credits flow.
 *
 * The credits feature is the first surface that mints a Stripe customer for a
 * client we haven't billed before. Earlier surfaces (Revenue Hub) only ever
 * mirror customers Stripe created on their own. So this helper exists.
 *
 * Contract:
 *   1. If `clients.stripe_customer_id` is already set, return it.
 *   2. Otherwise call `stripe.customers.create({ email, metadata: { client_id,
 *      organization_id } })` against the agency-correct Stripe account.
 *   3. Persist the new id back to `clients.stripe_customer_id` AND mirror the
 *      row into `stripe_customers` so the Revenue Hub picks it up.
 *
 * Race protection: `clients.stripe_customer_id` has a UNIQUE constraint
 * (migration 154). If two concurrent checkouts both call this helper, the
 * second `UPDATE ... WHERE stripe_customer_id IS NULL` fails to flip the
 * row, we re-read and return whatever the first invocation persisted. The
 * orphan customer record on the Stripe side is benign (no charges; Stripe
 * dashboard cleanup can purge it later) — picking a deterministic winner
 * matters more than zero-orphan.
 */

import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getStripe } from '@/lib/stripe/client';
import { getBrandFromAgency } from '@/lib/agency/detect';

interface ClientRow {
  id: string;
  name: string | null;
  agency: string | null;
  stripe_customer_id: string | null;
  organization_id: string | null;
}

export interface EnsureStripeCustomerResult {
  stripeCustomerId: string;
  /** True iff this call is the one that created the Stripe customer. */
  created: boolean;
  agency: 'nativz' | 'anderson';
}

/**
 * Ensure the client has a Stripe customer on their agency's Stripe account.
 *
 * @param admin   service-role Supabase client (RLS bypass; caller already
 *                authenticated the requester separately).
 * @param email   email to seed the Stripe customer record with. Always pass
 *                the requester's portal email when available; falls back to
 *                the client's primary contact otherwise.
 */
export async function ensureStripeCustomer(
  admin: SupabaseClient,
  clientId: string,
  email: string,
): Promise<EnsureStripeCustomerResult> {
  const { data: row, error } = await admin
    .from('clients')
    .select('id, name, agency, stripe_customer_id, organization_id')
    .eq('id', clientId)
    .maybeSingle<ClientRow>();
  if (error) {
    throw new Error(`ensureStripeCustomer: clients lookup failed: ${error.message}`);
  }
  if (!row) {
    throw new Error(`ensureStripeCustomer: no client ${clientId}`);
  }

  const agency = getBrandFromAgency(row.agency);

  if (row.stripe_customer_id) {
    return { stripeCustomerId: row.stripe_customer_id, created: false, agency };
  }

  const stripe = getStripe(agency);
  const customer: Stripe.Customer = await stripe.customers.create({
    email,
    name: row.name ?? undefined,
    metadata: {
      client_id: row.id,
      organization_id: row.organization_id ?? '',
      cortex_source: 'credits.checkout',
    },
  });

  // Persist back. Conditional `is.null` so two concurrent calls can't both
  // win — the loser re-reads the row and returns the winner's customer.
  const { data: claimed } = await admin
    .from('clients')
    .update({ stripe_customer_id: customer.id })
    .eq('id', clientId)
    .is('stripe_customer_id', null)
    .select('id')
    .maybeSingle();

  if (!claimed) {
    // Race lost. Re-read and return whatever the winner persisted.
    const { data: refresh } = await admin
      .from('clients')
      .select('stripe_customer_id')
      .eq('id', clientId)
      .maybeSingle<{ stripe_customer_id: string | null }>();
    if (refresh?.stripe_customer_id) {
      // Best-effort: we leave our orphan customer on the Stripe side. Trying
      // to delete it here introduces failure modes (Stripe API hiccup leaves
      // us claiming success while the orphan persists). The Stripe dashboard
      // sweep handles cleanup.
      return { stripeCustomerId: refresh.stripe_customer_id, created: false, agency };
    }
    // Pathological: row vanished mid-flight. Re-throw so the caller surfaces
    // a 500 rather than silently using our (now orphaned) customer id.
    throw new Error(`ensureStripeCustomer: client ${clientId} disappeared during update`);
  }

  // Mirror into stripe_customers for Revenue Hub joins. Best-effort — the
  // canonical link is `clients.stripe_customer_id`, mirror is denormalized.
  await admin
    .from('stripe_customers')
    .upsert(
      {
        id: customer.id,
        client_id: clientId,
        email: customer.email ?? email,
        name: customer.name ?? row.name ?? null,
        metadata: customer.metadata ?? {},
        livemode: customer.livemode,
        created_at: new Date(customer.created * 1000).toISOString(),
        synced_at: new Date().toISOString(),
        deleted: false,
      },
      { onConflict: 'id' },
    );

  return { stripeCustomerId: customer.id, created: true, agency };
}
