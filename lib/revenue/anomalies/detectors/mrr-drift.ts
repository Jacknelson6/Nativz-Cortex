import type { Detector } from '../types';
import { mrrForStripeSubscription } from '@/lib/stripe/mrr';
import type Stripe from 'stripe';

/**
 * Recompute MRR from live subscriptions and compare with the cached
 * `clients.mrr_cents`. Drift > $1 flags the client. Usually indicates a
 * missed webhook or a partial upsert.
 */
export const mrrDriftDetector: Detector = {
  id: 'mrr_drift',
  severity: 'warning',
  label: 'Cached MRR drifted from live subs',
  rationale:
    'clients.mrr_cents is a denormalized cache recomputed whenever subs change. A >$1 delta suggests a missed webhook or partial upsert. The daily reconcile cron recomputes MRR; this detector catches windows between runs.',
  async detect(admin) {
    const { data: clients } = await admin
      .from('clients')
      .select('id, name, mrr_cents')
      .not('stripe_customer_id', 'is', null);
    if (!clients) return [];

    const findings: Awaited<ReturnType<Detector['detect']>> = [];

    for (const c of clients) {
      const { data: subs } = await admin
        .from('stripe_subscriptions')
        .select('status, items')
        .eq('client_id', c.id);
      if (!subs) continue;

      let live = 0;
      for (const s of subs) {
        const items = Array.isArray(s.items)
          ? (s.items as unknown as Stripe.SubscriptionItem[])
          : [];
        if (items.length === 0) continue;
        live += mrrForStripeSubscription({
          status: s.status,
          items: { data: items },
        } as unknown as Stripe.Subscription);
      }

      const cached = c.mrr_cents ?? 0;
      const delta = Math.abs(live - cached);
      if (delta >= 100) {
        findings.push({
          entity_type: 'client',
          entity_id: c.id,
          client_id: c.id,
          title: `${c.name}: cached MRR off by $${(delta / 100).toFixed(2)}`,
          description: `cached=${cached}¢ live=${live}¢ — force reconcile or inspect subscription rows.`,
          metadata: { cached_cents: cached, live_cents: live, delta_cents: delta },
        });
      }
    }

    return findings;
  },
};
