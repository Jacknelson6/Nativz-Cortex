import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { netLifetimeRevenueCents, netRevenueByMonth } from './aggregates';

/**
 * `netLifetimeRevenueCents` and `netRevenueByMonth` are the single
 * source of truth for every "lifetime paid", "MRR", and "month-to-date"
 * number that surfaces in the UI and CSV exports. Three contracts to pin:
 *
 *   1. Net is always paid minus refunded, and clamped to zero. A refund
 *      total that exceeds paid invoices (chargeback dispute, voided
 *      duplicate charges) must not produce a negative dashboard number.
 *      A regression that dropped Math.max(0, ...) would print "-$200"
 *      lifetime revenue, which is both nonsense and a finance-team alarm.
 *
 *   2. Refunds only count when status='succeeded'. Stripe also emits
 *      'pending', 'failed', and 'canceled' refund rows. A regression that
 *      forgot the .eq('status', 'succeeded') filter would double-count
 *      pending refunds and understate revenue until they finalize (or
 *      forever if they're canceled).
 *
 *   3. Per-month buckets key on paid_at for paid rows and created_at for
 *      refund rows, sliced as 'YYYY-MM'. A regression that swapped the
 *      slice (e.g. used the full ISO date) would produce one bucket per
 *      day, breaking the chart. Rows with null timestamps are skipped
 *      rather than landing in a phantom bucket.
 *
 * The Supabase chain is mocked with a recursive thenable so each query
 * builder method (.select, .not, .eq, .gte, .lte) returns the same chain
 * and resolves to a configured `data` array when awaited. Tests assert on
 * captured method calls to verify the filters that landed.
 */

type PaidRow = { paid_at: string | null; amount_paid_cents: number | null };
type RefundRow = { created_at: string | null; amount_cents: number | null; status?: string };

function buildClient(opts: { paidRows?: PaidRow[]; refundRows?: RefundRow[] }) {
  const calls = {
    paid: { eq: [] as Array<[string, unknown]>, gte: [] as Array<[string, unknown]>, lte: [] as Array<[string, unknown]>, not: [] as Array<[string, string, unknown]> },
    refund: { eq: [] as Array<[string, unknown]>, gte: [] as Array<[string, unknown]>, lte: [] as Array<[string, unknown]> },
  };

  const buildChain = (table: 'paid' | 'refund', rows: unknown[]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn((col: string, val: unknown) => {
      calls[table].eq.push([col, val]);
      return chain;
    });
    chain.gte = vi.fn((col: string, val: unknown) => {
      calls[table].gte.push([col, val]);
      return chain;
    });
    chain.lte = vi.fn((col: string, val: unknown) => {
      calls[table].lte.push([col, val]);
      return chain;
    });
    chain.not = vi.fn((col: string, op: string, val: unknown) => {
      if (table === 'paid') calls.paid.not.push([col, op, val]);
      return chain;
    });
    chain.then = (resolve: (v: { data: unknown[] }) => unknown) =>
      Promise.resolve({ data: rows }).then(resolve);
    return chain;
  };

  const admin = {
    from: vi.fn((table: string) => {
      if (table === 'stripe_invoices') return buildChain('paid', opts.paidRows ?? []);
      if (table === 'stripe_refunds') return buildChain('refund', opts.refundRows ?? []);
      throw new Error(`unexpected table ${table}`);
    }),
  } as unknown as SupabaseClient;

  return { admin, calls };
}

describe('netLifetimeRevenueCents — basic arithmetic', () => {
  it('returns paid total when there are no refunds', async () => {
    const { admin } = buildClient({
      paidRows: [
        { paid_at: '2026-01-01', amount_paid_cents: 10_000 },
        { paid_at: '2026-02-01', amount_paid_cents: 5_000 },
      ],
      refundRows: [],
    });
    expect(await netLifetimeRevenueCents(admin)).toBe(15_000);
  });

  it('subtracts refunds from paid', async () => {
    const { admin } = buildClient({
      paidRows: [{ paid_at: '2026-01-01', amount_paid_cents: 10_000 }],
      refundRows: [{ created_at: '2026-01-15', amount_cents: 3_000 }],
    });
    expect(await netLifetimeRevenueCents(admin)).toBe(7_000);
  });

  it('clamps to zero when refunds exceed paid', async () => {
    // Pin: lifetime number is always non-negative. A chargeback dispute
    // that exceeds historical paid for a single client must not render
    // "-$50" anywhere.
    const { admin } = buildClient({
      paidRows: [{ paid_at: '2026-01-01', amount_paid_cents: 1_000 }],
      refundRows: [{ created_at: '2026-01-02', amount_cents: 6_000 }],
    });
    expect(await netLifetimeRevenueCents(admin)).toBe(0);
  });

  it('returns 0 when there is no activity at all', async () => {
    const { admin } = buildClient({ paidRows: [], refundRows: [] });
    expect(await netLifetimeRevenueCents(admin)).toBe(0);
  });

  it('treats null amount fields as zero', async () => {
    // Defensive: a row with null amount_paid_cents shouldn't NaN the total.
    const { admin } = buildClient({
      paidRows: [
        { paid_at: '2026-01-01', amount_paid_cents: null },
        { paid_at: '2026-01-02', amount_paid_cents: 4_200 },
      ],
      refundRows: [{ created_at: '2026-01-03', amount_cents: null }],
    });
    expect(await netLifetimeRevenueCents(admin)).toBe(4_200);
  });
});

describe('netLifetimeRevenueCents — query shape', () => {
  it('filters paid rows on a non-null paid_at', async () => {
    // Pin: stripe_invoices stores rows for every invoice ever (draft,
    // open, void). Only paid_at IS NOT NULL counts as cash collected.
    const { admin, calls } = buildClient({});
    await netLifetimeRevenueCents(admin);
    expect(calls.paid.not).toContainEqual(['paid_at', 'is', null]);
  });

  it('filters refunds on status=succeeded', async () => {
    // Pin: pending, failed, and canceled refunds must not subtract from
    // revenue. A regression that dropped this filter would double-count
    // refunds while Stripe is still processing them.
    const { admin, calls } = buildClient({});
    await netLifetimeRevenueCents(admin);
    expect(calls.refund.eq).toContainEqual(['status', 'succeeded']);
  });

  it('scopes by clientId on both tables when provided', async () => {
    const { admin, calls } = buildClient({});
    await netLifetimeRevenueCents(admin, { clientId: 'client-7' });
    expect(calls.paid.eq).toContainEqual(['client_id', 'client-7']);
    expect(calls.refund.eq).toContainEqual(['client_id', 'client-7']);
  });

  it('does NOT scope by clientId when omitted', async () => {
    const { admin, calls } = buildClient({});
    await netLifetimeRevenueCents(admin);
    expect(calls.paid.eq.find(([c]) => c === 'client_id')).toBeUndefined();
    expect(calls.refund.eq.find(([c]) => c === 'client_id')).toBeUndefined();
  });

  it('applies since/until on paid_at for invoices and created_at for refunds', async () => {
    // The two tables intentionally key on different timestamps:
    // invoices use paid_at (when the money landed), refunds use
    // created_at (when Stripe issued the refund). A regression that
    // swapped them would window paid invoices by their issue date,
    // counting unpaid issued-but-not-yet-paid invoices as revenue.
    const { admin, calls } = buildClient({});
    await netLifetimeRevenueCents(admin, { since: '2026-01-01', until: '2026-12-31' });
    expect(calls.paid.gte).toContainEqual(['paid_at', '2026-01-01']);
    expect(calls.paid.lte).toContainEqual(['paid_at', '2026-12-31']);
    expect(calls.refund.gte).toContainEqual(['created_at', '2026-01-01']);
    expect(calls.refund.lte).toContainEqual(['created_at', '2026-12-31']);
  });
});

describe('netRevenueByMonth — bucketing', () => {
  it('buckets paid rows by paid_at YYYY-MM', async () => {
    const { admin } = buildClient({
      paidRows: [
        { paid_at: '2026-01-15T00:00:00Z', amount_paid_cents: 1_000 },
        { paid_at: '2026-01-20T00:00:00Z', amount_paid_cents: 2_000 },
        { paid_at: '2026-02-05T00:00:00Z', amount_paid_cents: 3_000 },
      ],
      refundRows: [],
    });
    expect(await netRevenueByMonth(admin)).toEqual([
      { month: '2026-01', netCents: 3_000 },
      { month: '2026-02', netCents: 3_000 },
    ]);
  });

  it('subtracts refunds within their created_at month', async () => {
    const { admin } = buildClient({
      paidRows: [
        { paid_at: '2026-01-10', amount_paid_cents: 5_000 },
        { paid_at: '2026-02-10', amount_paid_cents: 5_000 },
      ],
      refundRows: [{ created_at: '2026-02-15', amount_cents: 1_000 }],
    });
    expect(await netRevenueByMonth(admin)).toEqual([
      { month: '2026-01', netCents: 5_000 },
      { month: '2026-02', netCents: 4_000 },
    ]);
  });

  it('clamps each month to zero independently', async () => {
    // A refund-heavy month after a paid-light month must not bleed
    // negative into the chart. The serializer wraps each month with
    // Math.max(0, ...).
    const { admin } = buildClient({
      paidRows: [{ paid_at: '2026-01-10', amount_paid_cents: 100 }],
      refundRows: [{ created_at: '2026-01-15', amount_cents: 500 }],
    });
    const result = await netRevenueByMonth(admin);
    expect(result).toEqual([{ month: '2026-01', netCents: 0 }]);
  });

  it('skips paid rows with null paid_at', async () => {
    // Defensive: a stale invoice with paid_at = NULL would otherwise
    // land in a "" bucket and corrupt the sort.
    const { admin } = buildClient({
      paidRows: [
        { paid_at: null, amount_paid_cents: 9_999 },
        { paid_at: '2026-03-01', amount_paid_cents: 1_000 },
      ],
      refundRows: [],
    });
    expect(await netRevenueByMonth(admin)).toEqual([{ month: '2026-03', netCents: 1_000 }]);
  });

  it('skips refund rows with null created_at', async () => {
    const { admin } = buildClient({
      paidRows: [{ paid_at: '2026-03-01', amount_paid_cents: 5_000 }],
      refundRows: [{ created_at: null, amount_cents: 1_000 }],
    });
    expect(await netRevenueByMonth(admin)).toEqual([{ month: '2026-03', netCents: 5_000 }]);
  });

  it('returns months sorted ascending by YYYY-MM', async () => {
    // Pin: charts assume left-to-right chronological order. A
    // regression that returned Map insertion order would let a
    // refund-first month appear before its paid month.
    const { admin } = buildClient({
      paidRows: [
        { paid_at: '2026-12-01', amount_paid_cents: 1_000 },
        { paid_at: '2026-01-01', amount_paid_cents: 2_000 },
        { paid_at: '2026-06-01', amount_paid_cents: 3_000 },
      ],
      refundRows: [],
    });
    const result = await netRevenueByMonth(admin);
    expect(result.map((r) => r.month)).toEqual(['2026-01', '2026-06', '2026-12']);
  });

  it('returns an empty array when no months had activity', async () => {
    const { admin } = buildClient({ paidRows: [], refundRows: [] });
    expect(await netRevenueByMonth(admin)).toEqual([]);
  });

  it('combines paid + refund into the same month bucket', async () => {
    // A refund issued in the same month as the paying invoice should
    // collapse to a single row with the net amount.
    const { admin } = buildClient({
      paidRows: [{ paid_at: '2026-04-10', amount_paid_cents: 10_000 }],
      refundRows: [{ created_at: '2026-04-20', amount_cents: 2_500 }],
    });
    expect(await netRevenueByMonth(admin)).toEqual([{ month: '2026-04', netCents: 7_500 }]);
  });

  it('creates a refund-only month with netCents=0 (clamped) when there is no paid offset', async () => {
    // Edge case: a refund processed in a month with no new paid
    // invoices. Bucket exists (it had activity) but clamps to 0.
    const { admin } = buildClient({
      paidRows: [],
      refundRows: [{ created_at: '2026-05-15', amount_cents: 4_000 }],
    });
    expect(await netRevenueByMonth(admin)).toEqual([{ month: '2026-05', netCents: 0 }]);
  });
});

describe('netRevenueByMonth — query plumbing reuses the same filters as lifetime', () => {
  it('passes clientId + since + until through to both tables', async () => {
    const { admin, calls } = buildClient({});
    await netRevenueByMonth(admin, {
      clientId: 'c-99',
      since: '2026-01-01',
      until: '2026-06-30',
    });
    expect(calls.paid.eq).toContainEqual(['client_id', 'c-99']);
    expect(calls.paid.gte).toContainEqual(['paid_at', '2026-01-01']);
    expect(calls.paid.lte).toContainEqual(['paid_at', '2026-06-30']);
    expect(calls.refund.eq).toContainEqual(['client_id', 'c-99']);
    expect(calls.refund.eq).toContainEqual(['status', 'succeeded']);
    expect(calls.refund.gte).toContainEqual(['created_at', '2026-01-01']);
    expect(calls.refund.lte).toContainEqual(['created_at', '2026-06-30']);
  });
});
