import type { Detector } from '../types';

/**
 * Stripe invoice exists with no linked client_id, but the customer IS linked
 * to a client. Caused by the invoice arriving via webhook before the
 * customer upsert ran, or by manual SQL that forgot to propagate.
 */
export const orphanStripeInvoiceDetector: Detector = {
  id: 'orphan_stripe_invoice',
  severity: 'warning',
  label: 'Unlinked invoice, linked customer',
  rationale:
    'This Stripe invoice is not attached to a Cortex client, but the linked Stripe customer IS. Back-propagate client_id (usually a one-shot UPDATE) or use the "link-stripe" admin action.',
  async detect(admin) {
    const { data } = await admin
      .from('stripe_invoices')
      .select('id, customer_id, number, stripe_customers(client_id, clients(id, name))')
      .is('client_id', null)
      .not('customer_id', 'is', null)
      .limit(200);
    if (!data) return [];

    return data
      .filter((inv) => {
        const customer = inv.stripe_customers as { client_id?: string | null } | null;
        return Boolean(customer?.client_id);
      })
      .map((inv) => {
        const customer = inv.stripe_customers as {
          client_id?: string | null;
          clients?: { id?: string; name?: string | null } | null;
        } | null;
        return {
          entity_type: 'stripe_invoice',
          entity_id: inv.id,
          client_id: customer?.client_id ?? null,
          title: `Invoice ${inv.number ?? inv.id} missing client_id`,
          description: `Customer ${inv.customer_id} is linked to ${customer?.clients?.name ?? 'a client'}, but the invoice itself has client_id=null.`,
          metadata: { stripe_customer_id: inv.customer_id },
        };
      });
  },
};
