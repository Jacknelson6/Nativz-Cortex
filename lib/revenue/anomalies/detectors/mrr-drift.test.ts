import { describe, expect, it, vi } from 'vitest';
import { mrrDriftDetector } from './mrr-drift';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * mrrDriftDetector recomputes live MRR from `stripe_subscriptions.items`
 * and compares it against the cached `clients.mrr_cents`. Three contracts
 * to pin:
 *
 *   1. The drift threshold is exactly $1 (100¢) and the comparison is
 *      `>= 100` against `Math.abs(live - cached)`. A regression to `>`
 *      would let a stuck-by-exactly-$1 client through; a regression that
 *      forgot Math.abs would only catch under-cached clients, missing
 *      the half where the cache is too high.
 *
 *   2. Only subs whose status is in {active, trialing, past_due} count
 *      toward live MRR (handled inside mrrForStripeSubscription, but
 *      pinned here at the integration boundary). Canceled subs must not
 *      contribute, otherwise stale cache + churn would surface as drift.
 *
 *   3. The query filters clients by `stripe_customer_id IS NOT NULL`;
 *      clients without a Stripe customer can't have a live MRR to compare
 *      against, so they MUST NOT be considered. A regression that broadened
 *      this filter would alert on every prospect-stage client.
 */

type ClientRow = { id: string; name: string; mrr_cents: number | null };
type SubRow = { status: string; items: unknown };

function buildAdmin(args: {
  clients: ClientRow[] | null;
  subsByClient: Record<string, SubRow[] | null>;
}) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];

  function clientsBuilder() {
    const not = vi.fn().mockImplementation((...notArgs: unknown[]) => {
      calls.push({ table: 'clients', method: 'not', args: notArgs });
      return Promise.resolve({ data: args.clients });
    });
    return { not };
  }

  function subsBuilder() {
    let clientId = '';
    const eq = vi.fn().mockImplementation((...eqArgs: unknown[]) => {
      clientId = eqArgs[1] as string;
      calls.push({ table: 'stripe_subscriptions', method: 'eq', args: eqArgs });
      return Promise.resolve({ data: args.subsByClient[clientId] ?? null });
    });
    return { eq };
  }

  const from = vi.fn().mockImplementation((table: string) => {
    calls.push({ table, method: 'from', args: [] });
    if (table === 'clients') {
      return {
        select: vi.fn().mockImplementation((...selectArgs: unknown[]) => {
          calls.push({ table, method: 'select', args: selectArgs });
          return clientsBuilder();
        }),
      };
    }
    if (table === 'stripe_subscriptions') {
      return {
        select: vi.fn().mockImplementation((...selectArgs: unknown[]) => {
          calls.push({ table, method: 'select', args: selectArgs });
          return subsBuilder();
        }),
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  return { admin: { from } as unknown as SupabaseClient, calls };
}

function monthlyItem(unitAmountCents: number, quantity = 1) {
  return {
    quantity,
    price: {
      unit_amount: unitAmountCents,
      recurring: { interval: 'month', interval_count: 1 },
    },
  };
}

function yearlyItem(unitAmountCents: number, quantity = 1) {
  return {
    quantity,
    price: {
      unit_amount: unitAmountCents,
      recurring: { interval: 'year', interval_count: 1 },
    },
  };
}

describe('mrrDriftDetector — registry metadata', () => {
  it('exposes id mrr_drift at warning severity', () => {
    expect(mrrDriftDetector.id).toBe('mrr_drift');
    expect(mrrDriftDetector.severity).toBe('warning');
  });
});

describe('mrrDriftDetector — query shape', () => {
  it('queries clients where stripe_customer_id IS NOT NULL', async () => {
    const { admin, calls } = buildAdmin({ clients: [], subsByClient: {} });
    await mrrDriftDetector.detect(admin);
    const fromClients = calls.find((c) => c.table === 'clients' && c.method === 'from');
    const notCall = calls.find((c) => c.table === 'clients' && c.method === 'not');
    expect(fromClients).toBeDefined();
    expect(notCall?.args).toEqual(['stripe_customer_id', 'is', null]);
  });

  it('per client, queries stripe_subscriptions by client_id', async () => {
    const { admin, calls } = buildAdmin({
      clients: [{ id: 'c1', name: 'Acme', mrr_cents: 0 }],
      subsByClient: { c1: [] },
    });
    await mrrDriftDetector.detect(admin);
    const eqCall = calls.find(
      (c) => c.table === 'stripe_subscriptions' && c.method === 'eq',
    );
    expect(eqCall?.args).toEqual(['client_id', 'c1']);
  });
});

describe('mrrDriftDetector — detect()', () => {
  it('returns [] when the clients query returns null', async () => {
    const { admin } = buildAdmin({ clients: null, subsByClient: {} });
    expect(await mrrDriftDetector.detect(admin)).toEqual([]);
  });

  it('returns [] when no clients have a stripe_customer_id', async () => {
    const { admin } = buildAdmin({ clients: [], subsByClient: {} });
    expect(await mrrDriftDetector.detect(admin)).toEqual([]);
  });

  it('does NOT flag a client whose cached MRR exactly matches live', async () => {
    // $50/mo monthly sub. cached_cents=5000. live=5000. delta=0.
    const { admin } = buildAdmin({
      clients: [{ id: 'c1', name: 'Acme', mrr_cents: 5000 }],
      subsByClient: {
        c1: [{ status: 'active', items: [monthlyItem(5000)] }],
      },
    });
    expect(await mrrDriftDetector.detect(admin)).toEqual([]);
  });

  it('does NOT flag drift below the $1 threshold (delta=99¢)', async () => {
    // Boundary: 99¢ delta is below the 100¢ trip wire.
    const { admin } = buildAdmin({
      clients: [{ id: 'c1', name: 'Acme', mrr_cents: 4901 }],
      subsByClient: {
        c1: [{ status: 'active', items: [monthlyItem(5000)] }],
      },
    });
    expect(await mrrDriftDetector.detect(admin)).toEqual([]);
  });

  it('flags drift exactly at the $1 threshold (delta=100¢)', async () => {
    // Pin: comparison is `>= 100`, not `> 100`.
    const { admin } = buildAdmin({
      clients: [{ id: 'c1', name: 'Acme', mrr_cents: 4900 }],
      subsByClient: {
        c1: [{ status: 'active', items: [monthlyItem(5000)] }],
      },
    });
    const out = await mrrDriftDetector.detect(admin);
    expect(out).toHaveLength(1);
    expect(out[0].metadata).toMatchObject({
      cached_cents: 4900,
      live_cents: 5000,
      delta_cents: 100,
    });
  });

  it('flags drift in EITHER direction (cached too high also surfaces)', async () => {
    // Math.abs is what makes this catch over-cached drift, not just under.
    const { admin } = buildAdmin({
      clients: [{ id: 'c1', name: 'Acme', mrr_cents: 9000 }],
      subsByClient: {
        c1: [{ status: 'active', items: [monthlyItem(5000)] }],
      },
    });
    const out = await mrrDriftDetector.detect(admin);
    expect(out).toHaveLength(1);
    expect(out[0].metadata?.delta_cents).toBe(4000);
  });

  it('treats cached null as 0 (flags any client with live MRR)', async () => {
    const { admin } = buildAdmin({
      clients: [{ id: 'c1', name: 'Acme', mrr_cents: null }],
      subsByClient: {
        c1: [{ status: 'active', items: [monthlyItem(5000)] }],
      },
    });
    const out = await mrrDriftDetector.detect(admin);
    expect(out).toHaveLength(1);
    expect(out[0].metadata).toMatchObject({ cached_cents: 0, live_cents: 5000 });
  });

  it('does NOT flag canceled subs (zero live MRR)', async () => {
    // Canceled status falls outside {active, trialing, past_due}, so live=0.
    // If cached=0 too, no drift; if cached is stale, the test below covers it.
    const { admin } = buildAdmin({
      clients: [{ id: 'c1', name: 'Acme', mrr_cents: 0 }],
      subsByClient: {
        c1: [{ status: 'canceled', items: [monthlyItem(5000)] }],
      },
    });
    expect(await mrrDriftDetector.detect(admin)).toEqual([]);
  });

  it('flags when the only sub is canceled but cache is non-zero (stale cache)', async () => {
    const { admin } = buildAdmin({
      clients: [{ id: 'c1', name: 'Acme', mrr_cents: 5000 }],
      subsByClient: {
        c1: [{ status: 'canceled', items: [monthlyItem(5000)] }],
      },
    });
    const out = await mrrDriftDetector.detect(admin);
    expect(out).toHaveLength(1);
    expect(out[0].metadata).toMatchObject({ cached_cents: 5000, live_cents: 0, delta_cents: 5000 });
  });

  it('annualizes yearly subs into a monthly figure', async () => {
    // $1200/yr -> $100/mo.
    const { admin } = buildAdmin({
      clients: [{ id: 'c1', name: 'Acme', mrr_cents: 0 }],
      subsByClient: {
        c1: [{ status: 'active', items: [yearlyItem(120000)] }],
      },
    });
    const out = await mrrDriftDetector.detect(admin);
    expect(out[0].metadata?.live_cents).toBe(10000);
  });

  it('sums across multiple subs and multiple items per sub', async () => {
    // Sub A: $50 monthly. Sub B: 2x $25 monthly = $50. Total live=10000¢.
    const { admin } = buildAdmin({
      clients: [{ id: 'c1', name: 'Acme', mrr_cents: 0 }],
      subsByClient: {
        c1: [
          { status: 'active', items: [monthlyItem(5000)] },
          { status: 'trialing', items: [monthlyItem(2500, 2)] },
        ],
      },
    });
    const out = await mrrDriftDetector.detect(admin);
    expect(out[0].metadata?.live_cents).toBe(10000);
  });

  it('skips subs with empty items array (no contribution to live)', async () => {
    const { admin } = buildAdmin({
      clients: [{ id: 'c1', name: 'Acme', mrr_cents: 0 }],
      subsByClient: {
        c1: [{ status: 'active', items: [] }],
      },
    });
    expect(await mrrDriftDetector.detect(admin)).toEqual([]);
  });

  it('skips subs whose items field is not an array (defensive)', async () => {
    // JSONB column theoretically allows other shapes; the detector guards
    // with Array.isArray so a malformed row produces zero, not a crash.
    const { admin } = buildAdmin({
      clients: [{ id: 'c1', name: 'Acme', mrr_cents: 0 }],
      subsByClient: {
        c1: [{ status: 'active', items: { not: 'an array' } }],
      },
    });
    expect(await mrrDriftDetector.detect(admin)).toEqual([]);
  });

  it('continues to the next client when one client has null subs (RLS / error)', async () => {
    const { admin } = buildAdmin({
      clients: [
        { id: 'a', name: 'A', mrr_cents: 9999 },
        { id: 'b', name: 'B', mrr_cents: 0 },
      ],
      subsByClient: {
        a: null,
        b: [{ status: 'active', items: [monthlyItem(5000)] }],
      },
    });
    const out = await mrrDriftDetector.detect(admin);
    expect(out.map((f) => f.entity_id)).toEqual(['b']);
  });

  it('finding shape: entity_type=client, entity_id=client_id, dollars formatted to 2 decimals', async () => {
    const { admin } = buildAdmin({
      clients: [{ id: 'c1', name: 'Acme', mrr_cents: 4900 }],
      subsByClient: {
        c1: [{ status: 'active', items: [monthlyItem(5000)] }],
      },
    });
    const out = await mrrDriftDetector.detect(admin);
    expect(out[0].entity_type).toBe('client');
    expect(out[0].entity_id).toBe('c1');
    expect(out[0].client_id).toBe('c1');
    expect(out[0].title).toContain('Acme');
    expect(out[0].title).toMatch(/\$1\.00\b/);
    expect(out[0].description).toContain('cached=4900');
    expect(out[0].description).toContain('live=5000');
  });

  it('produces independent findings for multiple drifting clients', async () => {
    const { admin } = buildAdmin({
      clients: [
        { id: 'a', name: 'Alpha', mrr_cents: 0 },
        { id: 'b', name: 'Beta', mrr_cents: 0 },
      ],
      subsByClient: {
        a: [{ status: 'active', items: [monthlyItem(5000)] }],
        b: [{ status: 'active', items: [monthlyItem(7500)] }],
      },
    });
    const out = await mrrDriftDetector.detect(admin);
    expect(out.map((f) => f.entity_id).sort()).toEqual(['a', 'b']);
    expect(out.find((f) => f.entity_id === 'a')?.metadata?.live_cents).toBe(5000);
    expect(out.find((f) => f.entity_id === 'b')?.metadata?.live_cents).toBe(7500);
  });
});
