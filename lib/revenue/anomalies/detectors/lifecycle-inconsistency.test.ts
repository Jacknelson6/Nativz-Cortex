import { describe, expect, it, vi } from 'vitest';
import { lifecycleInconsistencyDetector } from './lifecycle-inconsistency';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * lifecycleInconsistencyDetector flags clients whose lifecycle_state is
 * 'active' but who have zero paid invoices. Three contracts to pin:
 *
 *   1. The ONLY clients considered are those with lifecycle_state='active'.
 *      A regression that broadened the filter would surface every prospect
 *      / churned client and drown the admin alerts page.
 *
 *   2. The paid-invoice probe uses a HEAD count query. We pass
 *      `{ count: 'exact', head: true }` so we don't actually transfer the
 *      invoice rows over the wire — important for any tenant with a long
 *      Stripe history.
 *
 *   3. A NULL count from Supabase is treated as zero, not skipped. RLS-
 *      blocked or empty results MUST flag the client; otherwise a perm
 *      regression would hide legitimate findings.
 */

type Client = { id: string; name: string };
type CountResult = { count: number | null };

function buildAdmin(args: {
  activeClients: Client[] | null;
  invoiceCounts: Record<string, CountResult>;
}) {
  const { activeClients, invoiceCounts } = args;

  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];

  function clientsBuilder() {
    const eq = vi.fn().mockImplementation((...eqArgs: unknown[]) => {
      calls.push({ table: 'clients', method: 'eq', args: eqArgs });
      return Promise.resolve({ data: activeClients });
    });
    return { eq };
  }

  function invoicesBuilder(selectArgs: unknown[]) {
    let clientId: string | null = null;
    const eqStatus = vi.fn().mockImplementation((...args: unknown[]) => {
      calls.push({ table: 'stripe_invoices', method: 'eq.status', args });
      return Promise.resolve({ count: invoiceCounts[clientId ?? '']?.count ?? null });
    });
    const eqClient = vi.fn().mockImplementation((...args: unknown[]) => {
      clientId = args[1] as string;
      calls.push({ table: 'stripe_invoices', method: 'eq.client_id', args });
      return { eq: eqStatus };
    });
    return {
      eq: eqClient,
      _selectArgs: selectArgs,
    };
  }

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'clients') {
      return {
        select: vi.fn().mockImplementation((...selectArgs: unknown[]) => {
          calls.push({ table, method: 'select', args: selectArgs });
          return clientsBuilder();
        }),
      };
    }
    if (table === 'stripe_invoices') {
      return {
        select: vi.fn().mockImplementation((...selectArgs: unknown[]) => {
          calls.push({ table, method: 'select', args: selectArgs });
          return invoicesBuilder(selectArgs);
        }),
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  return { admin: { from } as unknown as SupabaseClient, calls };
}

describe('lifecycleInconsistencyDetector — registry metadata', () => {
  it('exposes id lifecycle_inconsistency at warning severity', () => {
    expect(lifecycleInconsistencyDetector.id).toBe('lifecycle_inconsistency');
    expect(lifecycleInconsistencyDetector.severity).toBe('warning');
  });
});

describe('lifecycleInconsistencyDetector — detect()', () => {
  it('returns [] when no clients are in lifecycle_state=active', async () => {
    const { admin } = buildAdmin({ activeClients: [], invoiceCounts: {} });
    expect(await lifecycleInconsistencyDetector.detect(admin)).toEqual([]);
  });

  it('returns [] when the active-clients query returns null (RLS / error)', async () => {
    const { admin } = buildAdmin({ activeClients: null, invoiceCounts: {} });
    expect(await lifecycleInconsistencyDetector.detect(admin)).toEqual([]);
  });

  it('flags an active client with zero paid invoices', async () => {
    const { admin } = buildAdmin({
      activeClients: [{ id: 'c1', name: 'Acme' }],
      invoiceCounts: { c1: { count: 0 } },
    });
    const out = await lifecycleInconsistencyDetector.detect(admin);
    expect(out).toHaveLength(1);
    expect(out[0].entity_type).toBe('client');
    expect(out[0].entity_id).toBe('c1');
    expect(out[0].client_id).toBe('c1');
    expect(out[0].title).toContain('Acme');
    expect(out[0].title).toContain("'active' with zero paid invoices");
  });

  it('does NOT flag an active client that has paid invoices', async () => {
    const { admin } = buildAdmin({
      activeClients: [{ id: 'c1', name: 'Acme' }],
      invoiceCounts: { c1: { count: 3 } },
    });
    expect(await lifecycleInconsistencyDetector.detect(admin)).toEqual([]);
  });

  it('treats a NULL count as zero (still flags the client)', async () => {
    // Supabase returns count=null on RLS / error / unreachable. The detector
    // can't tell the difference and prefers to surface the inconsistency.
    const { admin } = buildAdmin({
      activeClients: [{ id: 'c1', name: 'Acme' }],
      invoiceCounts: { c1: { count: null } },
    });
    const out = await lifecycleInconsistencyDetector.detect(admin);
    expect(out).toHaveLength(1);
    expect(out[0].client_id).toBe('c1');
  });

  it('partitions: flags only the unpaid client when both are active', async () => {
    const { admin } = buildAdmin({
      activeClients: [
        { id: 'paid', name: 'Paid Co' },
        { id: 'unpaid', name: 'Unpaid Co' },
      ],
      invoiceCounts: {
        paid: { count: 5 },
        unpaid: { count: 0 },
      },
    });
    const out = await lifecycleInconsistencyDetector.detect(admin);
    expect(out.map((f) => f.entity_id)).toEqual(['unpaid']);
  });

  it('uses a HEAD count query (does not pull rows)', async () => {
    const { admin, calls } = buildAdmin({
      activeClients: [{ id: 'c1', name: 'Acme' }],
      invoiceCounts: { c1: { count: 0 } },
    });
    await lifecycleInconsistencyDetector.detect(admin);
    const invoiceSelect = calls.find(
      (c) => c.table === 'stripe_invoices' && c.method === 'select',
    );
    // Second arg to .select() is the options object; assert head:true so any
    // future regression that drops it shows up loudly.
    const opts = invoiceSelect?.args[1] as { count?: string; head?: boolean } | undefined;
    expect(opts?.head).toBe(true);
    expect(opts?.count).toBe('exact');
  });

  it('filters the active-clients query by lifecycle_state=active', async () => {
    const { admin, calls } = buildAdmin({ activeClients: [], invoiceCounts: {} });
    await lifecycleInconsistencyDetector.detect(admin);
    const eq = calls.find((c) => c.table === 'clients' && c.method === 'eq');
    expect(eq?.args[0]).toBe('lifecycle_state');
    expect(eq?.args[1]).toBe('active');
  });
});
