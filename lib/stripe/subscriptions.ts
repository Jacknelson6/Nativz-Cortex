import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { mrrForStripeSubscription } from './mrr';

type AdminClient = SupabaseClient;

export async function upsertSubscriptionFromStripe(
  sub: Stripe.Subscription,
  admin: AdminClient = createAdminClient(),
): Promise<{ id: string; client_id: string | null }> {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

  const { data: customerRow } = await admin
    .from('stripe_customers')
    .select('client_id')
    .eq('id', customerId)
    .maybeSingle();
  const clientId = customerRow?.client_id ?? null;

  const firstItem = sub.items.data[0];
  const price = firstItem?.price;
  const product = price && typeof price.product !== 'string' ? price.product : null;
  const productId = price
    ? typeof price.product === 'string'
      ? price.product
      : price.product.id
    : null;

  // Stripe API moved current_period_* from Subscription onto SubscriptionItem
  // in newer API versions. Read from either location to stay compatible.
  const periodStart =
    (sub as unknown as { current_period_start?: number | null }).current_period_start ??
    firstItem?.current_period_start ??
    null;
  const periodEnd =
    (sub as unknown as { current_period_end?: number | null }).current_period_end ??
    firstItem?.current_period_end ??
    null;

  const row = {
    id: sub.id,
    customer_id: customerId,
    client_id: clientId,
    status: sub.status,
    current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: sub.cancel_at_period_end,
    canceled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
    started_at: sub.start_date ? new Date(sub.start_date * 1000).toISOString() : null,
    price_id: price?.id ?? null,
    product_id: productId,
    product_name:
      product && 'name' in product ? (product as Stripe.Product).name : null,
    price_nickname: price?.nickname ?? null,
    unit_amount_cents: price?.unit_amount ?? null,
    interval: price?.recurring?.interval ?? null,
    interval_count: price?.recurring?.interval_count ?? null,
    quantity: firstItem?.quantity ?? null,
    items: sub.items.data,
    metadata: sub.metadata ?? {},
    livemode: sub.livemode,
    synced_at: new Date().toISOString(),
  };

  const { error } = await admin.from('stripe_subscriptions').upsert(row, { onConflict: 'id' });
  if (error) throw new Error(`upsertSubscriptionFromStripe: ${error.message}`);

  if (clientId) {
    await recomputeClientMrr(clientId, admin);
    await advanceLifecycleOnSubscriptionChange(clientId, sub.status, admin);
  }

  return { id: sub.id, client_id: clientId };
}

export async function recomputeClientMrr(
  clientId: string,
  admin: AdminClient = createAdminClient(),
): Promise<number> {
  const { data: rows } = await admin
    .from('stripe_subscriptions')
    .select('status, unit_amount_cents, quantity, interval, interval_count, items')
    .eq('client_id', clientId);

  let total = 0;
  for (const row of rows ?? []) {
    const items = Array.isArray(row.items) ? (row.items as unknown as Stripe.SubscriptionItem[]) : [];
    if (items.length > 0) {
      total += mrrForStripeSubscription({
        status: row.status,
        items: { data: items },
      } as unknown as Stripe.Subscription);
    } else if (row.unit_amount_cents && row.interval) {
      const fallback = mrrForStripeSubscription({
        status: row.status,
        items: {
          data: [
            {
              quantity: row.quantity ?? 1,
              price: {
                unit_amount: row.unit_amount_cents,
                recurring: { interval: row.interval, interval_count: row.interval_count ?? 1 },
              },
            },
          ],
        },
      } as unknown as Stripe.Subscription);
      total += fallback;
    }
  }

  await admin.from('clients').update({ mrr_cents: total }).eq('id', clientId);
  return total;
}

async function advanceLifecycleOnSubscriptionChange(
  clientId: string,
  status: string,
  admin: AdminClient,
): Promise<void> {
  const { data: client } = await admin
    .from('clients')
    .select('lifecycle_state')
    .eq('id', clientId)
    .maybeSingle();
  if (!client) return;

  if (status === 'active' && client.lifecycle_state === 'paid_deposit') {
    await admin.from('clients').update({ lifecycle_state: 'active' }).eq('id', clientId);
  }

  if (status === 'canceled') {
    const { count } = await admin
      .from('stripe_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .in('status', ['active', 'trialing', 'past_due']);
    if ((count ?? 0) === 0 && client.lifecycle_state === 'active') {
      await admin.from('clients').update({ lifecycle_state: 'churned' }).eq('id', clientId);
    }
  }
}
