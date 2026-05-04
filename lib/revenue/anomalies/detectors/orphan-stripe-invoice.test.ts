import { describe, expect, it, vi } from 'vitest';
import { orphanStripeInvoiceDetector } from './orphan-stripe-invoice';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * orphanStripeInvoiceDetector flags Stripe invoices with NULL client_id
 * whose linked customer IS attached to a client. Three contracts to pin:
 *
 *   1. The detector filters in TWO stages: the SQL filter (client_id IS
 *      NULL + customer_id IS NOT NULL), and a JS-side filter that drops
 *      rows whose stripe_customers.client_id is also null. The second
 *      stage is what makes this detector a true "orphan with linked
 *      customer" check, not just "any invoice with no client."
 *
 *   2. The finding's client_id is the JOINED customer's client_id, not
 *      the (null) invoice client_id. The admin UI uses this to one-click
 *      back-propagate the link.
 *
 *   3. The title prefers the invoice `number` over the raw id, falling
 *      back to id when number is null. Operators reading the alerts page
 *      identify invoices by their human "INV-…" number when present.
 */

type InvoiceRow = {
  id: string;
  customer_id: string | null;
  number: string | null;
  stripe_customers: {
    client_id: string | null;
    clients: { id: string; name: string | null } | null;
  } | null;
};

function buildAdmin(rows: InvoiceRow[] | null) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const limit = vi.fn().mockResolvedValue({ data: rows });
  const not = vi.fn().mockImplementation((...args: unknown[]) => {
    calls.push({ method: 'not', args });
    return { limit };
  });
  const isFn = vi.fn().mockImplementation((...args: unknown[]) => {
    calls.push({ method: 'is', args });
    return { not };
  });
  const select = vi.fn().mockImplementation((...args: unknown[]) => {
    calls.push({ method: 'select', args });
    return { is: isFn };
  });
  const from = vi.fn().mockImplementation((table: string) => {
    calls.push({ method: 'from', args: [table] });
    return { select };
  });
  return { admin: { from } as unknown as SupabaseClient, calls };
}

describe('orphanStripeInvoiceDetector — registry metadata', () => {
  it('exposes id orphan_stripe_invoice at warning severity', () => {
    expect(orphanStripeInvoiceDetector.id).toBe('orphan_stripe_invoice');
    expect(orphanStripeInvoiceDetector.severity).toBe('warning');
  });
});

describe('orphanStripeInvoiceDetector — query shape', () => {
  it('queries stripe_invoices with client_id IS NULL and customer_id IS NOT NULL', async () => {
    const { admin, calls } = buildAdmin([]);
    await orphanStripeInvoiceDetector.detect(admin);
    expect(calls.find((c) => c.method === 'from')?.args[0]).toBe('stripe_invoices');
    const isCall = calls.find((c) => c.method === 'is');
    expect(isCall?.args).toEqual(['client_id', null]);
    const notCall = calls.find((c) => c.method === 'not');
    expect(notCall?.args).toEqual(['customer_id', 'is', null]);
  });

  it('joins through stripe_customers + clients in the select', async () => {
    const { admin, calls } = buildAdmin([]);
    await orphanStripeInvoiceDetector.detect(admin);
    const select = calls.find((c) => c.method === 'select');
    const sel = select?.args[0] as string;
    expect(sel).toContain('stripe_customers');
    expect(sel).toContain('clients');
  });
});

describe('orphanStripeInvoiceDetector — detect()', () => {
  it('returns [] when the query returns null', async () => {
    const { admin } = buildAdmin(null);
    expect(await orphanStripeInvoiceDetector.detect(admin)).toEqual([]);
  });

  it('returns [] when no orphan rows match', async () => {
    const { admin } = buildAdmin([]);
    expect(await orphanStripeInvoiceDetector.detect(admin)).toEqual([]);
  });

  it('JS-filters out rows whose linked customer ALSO lacks a client_id', async () => {
    // Half-orphans (customer also unlinked) are NOT actionable — link the
    // customer first. Pin so the JS-side filter doesn't regress.
    const { admin } = buildAdmin([
      {
        id: 'inv_unlinked_customer',
        customer_id: 'cus_x',
        number: 'INV-001',
        stripe_customers: { client_id: null, clients: null },
      },
      {
        id: 'inv_real_orphan',
        customer_id: 'cus_y',
        number: 'INV-002',
        stripe_customers: {
          client_id: 'client-acme',
          clients: { id: 'client-acme', name: 'Acme' },
        },
      },
    ]);
    const out = await orphanStripeInvoiceDetector.detect(admin);
    expect(out).toHaveLength(1);
    expect(out[0].entity_id).toBe('inv_real_orphan');
  });

  it('attributes the finding to the JOINED client_id (not the null invoice one)', async () => {
    const { admin } = buildAdmin([
      {
        id: 'inv_1',
        customer_id: 'cus_y',
        number: 'INV-002',
        stripe_customers: {
          client_id: 'client-acme',
          clients: { id: 'client-acme', name: 'Acme' },
        },
      },
    ]);
    const out = await orphanStripeInvoiceDetector.detect(admin);
    expect(out[0].client_id).toBe('client-acme');
    expect(out[0].entity_type).toBe('stripe_invoice');
  });

  it('prefers the invoice number in the title when present', async () => {
    const { admin } = buildAdmin([
      {
        id: 'inv_1',
        customer_id: 'cus_y',
        number: 'INV-002',
        stripe_customers: {
          client_id: 'client-acme',
          clients: { id: 'client-acme', name: 'Acme' },
        },
      },
    ]);
    const out = await orphanStripeInvoiceDetector.detect(admin);
    expect(out[0].title).toContain('INV-002');
    expect(out[0].title).not.toContain('inv_1');
  });

  it('falls back to the invoice id when number is null', async () => {
    const { admin } = buildAdmin([
      {
        id: 'inv_no_number',
        customer_id: 'cus_y',
        number: null,
        stripe_customers: {
          client_id: 'client-acme',
          clients: { id: 'client-acme', name: 'Acme' },
        },
      },
    ]);
    const out = await orphanStripeInvoiceDetector.detect(admin);
    expect(out[0].title).toContain('inv_no_number');
  });

  it('renders the linked client name in the description when present', async () => {
    const { admin } = buildAdmin([
      {
        id: 'inv_1',
        customer_id: 'cus_y',
        number: 'INV-002',
        stripe_customers: {
          client_id: 'client-acme',
          clients: { id: 'client-acme', name: 'Acme Corp' },
        },
      },
    ]);
    const out = await orphanStripeInvoiceDetector.detect(admin);
    expect(out[0].description).toContain('Acme Corp');
    expect(out[0].description).toContain('cus_y');
  });

  it('falls back to "a client" in the description when client name is null', async () => {
    // The clients row exists (id present) but name is null. The detector
    // should still produce a readable description.
    const { admin } = buildAdmin([
      {
        id: 'inv_1',
        customer_id: 'cus_y',
        number: 'INV-002',
        stripe_customers: {
          client_id: 'client-acme',
          clients: { id: 'client-acme', name: null },
        },
      },
    ]);
    const out = await orphanStripeInvoiceDetector.detect(admin);
    expect(out[0].description).toContain('a client');
  });

  it('preserves stripe_customer_id in metadata', async () => {
    const { admin } = buildAdmin([
      {
        id: 'inv_1',
        customer_id: 'cus_y',
        number: 'INV-002',
        stripe_customers: {
          client_id: 'client-acme',
          clients: { id: 'client-acme', name: 'Acme' },
        },
      },
    ]);
    const out = await orphanStripeInvoiceDetector.detect(admin);
    expect(out[0].metadata).toMatchObject({ stripe_customer_id: 'cus_y' });
  });
});
