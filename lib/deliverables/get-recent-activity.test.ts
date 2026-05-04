import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeliverableTypeSlug } from '@/lib/credits/types';

interface CachedType {
  id: string;
  slug: DeliverableTypeSlug;
  display_name: string;
  sort_order: number;
  is_active: boolean;
}

const listDeliverableTypesMock = vi.fn(
  async (_admin: unknown): Promise<CachedType[]> => [],
);

vi.mock('./types-cache', () => ({
  listDeliverableTypes: listDeliverableTypesMock,
}));

const { getRecentDeliverableActivity } = await import('./get-recent-activity');

/**
 * Activity feed loader for the deliverables dashboard.
 *
 * Contract under test:
 *   1. Reads the last N rows of credit_transactions for the client, default
 *      limit 30, override via options.limit.
 *   2. Decorates each row with the deliverable_type slug from the cache;
 *      rows whose type is unknown are dropped (not silently relabelled).
 *   3. Renders a sentence-case headline + optional detail line per
 *      CreditTransactionKind. Wording lives in the helper, not the UI, so
 *      copy regressions caught here.
 *   4. Drop-video charges get a thumbnailUrl when the unit row resolves;
 *      everything else (including drop_video rows that don't resolve) gets
 *      thumbnailUrl: null.
 *   5. consume rows with a scheduled_post_id whose title resolves get a
 *      ", <title> approved" suffix; reviewer_email becomes the detail.
 */

interface TxRow {
  id: string;
  client_id: string;
  deliverable_type_id: string;
  kind: string;
  delta: number;
  charge_unit_kind: string | null;
  charge_unit_id: string | null;
  scheduled_post_id: string | null;
  note: string | null;
  reviewer_email: string | null;
  created_at: string;
}

interface PostRow {
  id: string;
  title: string | null;
}

interface DropVideoRow {
  id: string;
  thumbnail_url: string | null;
}

interface AdminOpts {
  txRows: TxRow[];
  postRows?: PostRow[];
  dropVideoRows?: DropVideoRow[];
}

function makeAdmin(opts: AdminOpts): {
  admin: SupabaseClient;
  capturedLimit: () => number | null;
} {
  let capturedLimit: number | null = null;
  const fromMock = vi.fn((table: string) => {
    if (table === 'credit_transactions') {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        order: vi.fn(() => builder),
        limit: vi.fn((n: number) => {
          capturedLimit = n;
          return builder;
        }),
        returns: vi.fn(async () => ({ data: opts.txRows, error: null })),
      };
      return builder;
    }
    if (table === 'scheduled_posts') {
      const builder = {
        select: vi.fn(() => builder),
        in: vi.fn(() => builder),
        returns: vi.fn(async () => ({ data: opts.postRows ?? [], error: null })),
      };
      return builder;
    }
    if (table === 'content_drop_videos') {
      const builder = {
        select: vi.fn(() => builder),
        in: vi.fn(() => builder),
        returns: vi.fn(async () => ({
          data: opts.dropVideoRows ?? [],
          error: null,
        })),
      };
      return builder;
    }
    throw new Error(`unexpected table: ${table}`);
  });
  return {
    admin: { from: fromMock } as unknown as SupabaseClient,
    capturedLimit: () => capturedLimit,
  };
}

const TYPES: CachedType[] = [
  {
    id: 'type-edited',
    slug: 'edited_video',
    display_name: 'Edited Video',
    sort_order: 10,
    is_active: true,
  },
  {
    id: 'type-ugc',
    slug: 'ugc_video',
    display_name: 'UGC Video',
    sort_order: 20,
    is_active: true,
  },
  {
    id: 'type-static',
    slug: 'static_graphic',
    display_name: 'Static Graphic',
    sort_order: 30,
    is_active: true,
  },
];

function tx(overrides: Partial<TxRow>): TxRow {
  return {
    id: 'tx-1',
    client_id: 'client-1',
    deliverable_type_id: 'type-edited',
    kind: 'consume',
    delta: -1,
    charge_unit_kind: null,
    charge_unit_id: null,
    scheduled_post_id: null,
    note: null,
    reviewer_email: null,
    created_at: '2026-04-15T12:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  listDeliverableTypesMock.mockReset();
  listDeliverableTypesMock.mockResolvedValue(TYPES);
});

describe('getRecentDeliverableActivity', () => {
  it('uses a default limit of 30 when options.limit is not supplied', async () => {
    const { admin, capturedLimit } = makeAdmin({ txRows: [] });
    await getRecentDeliverableActivity(admin, 'client-1');
    expect(capturedLimit()).toBe(30);
  });

  it('honours options.limit when provided', async () => {
    const { admin, capturedLimit } = makeAdmin({ txRows: [] });
    await getRecentDeliverableActivity(admin, 'client-1', { limit: 5 });
    expect(capturedLimit()).toBe(5);
  });

  it('skips transactions whose deliverable_type is not in the cache', async () => {
    const { admin } = makeAdmin({
      txRows: [
        tx({ id: 'tx-good', deliverable_type_id: 'type-edited' }),
        tx({ id: 'tx-bad', deliverable_type_id: 'type-retired' }),
      ],
    });
    const out = await getRecentDeliverableActivity(admin, 'client-1');
    expect(out.map((r) => r.id)).toEqual(['tx-good']);
  });

  it('summarises grant_monthly with a "Monthly scope refilled" headline and "<n> X added" detail when delta>0', async () => {
    const { admin } = makeAdmin({
      txRows: [tx({ kind: 'grant_monthly', delta: 8 })],
    });
    const [entry] = await getRecentDeliverableActivity(admin, 'client-1');
    expect(entry.headline).toBe('Monthly scope refilled');
    expect(entry.detail).toBe('8 edited videos added');
  });

  it('grant_monthly with delta<=0 has a null detail (refill but nothing to add)', async () => {
    const { admin } = makeAdmin({
      txRows: [tx({ kind: 'grant_monthly', delta: 0 })],
    });
    const [entry] = await getRecentDeliverableActivity(admin, 'client-1');
    expect(entry.headline).toBe('Monthly scope refilled');
    expect(entry.detail).toBeNull();
  });

  it('summarises grant_topup with the count in the headline and the trimmed note as detail', async () => {
    const { admin } = makeAdmin({
      txRows: [
        tx({
          kind: 'grant_topup',
          delta: 3,
          note: '  bonus pack from Q2 sale  ',
        }),
      ],
    });
    const [entry] = await getRecentDeliverableActivity(admin, 'client-1');
    expect(entry.headline).toBe('3 edited videos added (top-up)');
    expect(entry.detail).toBe('bonus pack from Q2 sale');
  });

  it('grant_topup with no note has a null detail', async () => {
    const { admin } = makeAdmin({
      txRows: [tx({ kind: 'grant_topup', delta: 1, note: '' })],
    });
    const [entry] = await getRecentDeliverableActivity(admin, 'client-1');
    expect(entry.headline).toBe('1 edited video added (top-up)');
    expect(entry.detail).toBeNull();
  });

  it('consume singular: absDelta=1 uses singular noun', async () => {
    const { admin } = makeAdmin({
      txRows: [tx({ kind: 'consume', delta: -1 })],
    });
    const [entry] = await getRecentDeliverableActivity(admin, 'client-1');
    expect(entry.headline).toBe('1 edited video used');
  });

  it('consume plural: absDelta>1 uses plural noun', async () => {
    const { admin } = makeAdmin({
      txRows: [tx({ kind: 'consume', delta: -3, deliverable_type_id: 'type-ugc' })],
    });
    const [entry] = await getRecentDeliverableActivity(admin, 'client-1');
    expect(entry.headline).toBe('3 UGC-style videos used');
  });

  it('consume with a resolved post title appends ", <title> approved"', async () => {
    const { admin } = makeAdmin({
      txRows: [
        tx({
          kind: 'consume',
          delta: -1,
          scheduled_post_id: 'post-7',
          reviewer_email: 'amy@nativz.io',
        }),
      ],
      postRows: [{ id: 'post-7', title: 'Hot Take #4' }],
    });
    const [entry] = await getRecentDeliverableActivity(admin, 'client-1');
    expect(entry.headline).toBe('1 edited video used, Hot Take #4 approved');
    expect(entry.detail).toBe('amy@nativz.io');
  });

  it('consume with no resolved post title omits the suffix', async () => {
    const { admin } = makeAdmin({
      txRows: [
        tx({ kind: 'consume', delta: -1, scheduled_post_id: 'post-missing' }),
      ],
      postRows: [],
    });
    const [entry] = await getRecentDeliverableActivity(admin, 'client-1');
    expect(entry.headline).toBe('1 edited video used');
  });

  it('summarises refund with returned headline and trimmed note as detail', async () => {
    const { admin } = makeAdmin({
      txRows: [
        tx({
          kind: 'refund',
          delta: 1,
          note: '  client retracted approval  ',
        }),
      ],
    });
    const [entry] = await getRecentDeliverableActivity(admin, 'client-1');
    expect(entry.headline).toBe('1 edited video returned');
    expect(entry.detail).toBe('client retracted approval');
  });

  it('refund with no note falls back to "Approval reversed"', async () => {
    const { admin } = makeAdmin({
      txRows: [tx({ kind: 'refund', delta: 1, note: null })],
    });
    const [entry] = await getRecentDeliverableActivity(admin, 'client-1');
    expect(entry.detail).toBe('Approval reversed');
  });

  it('summarises adjust with "added" or "removed" depending on sign', async () => {
    const { admin } = makeAdmin({
      txRows: [
        tx({ id: 'tx-pos', kind: 'adjust', delta: 2, note: 'goodwill' }),
        tx({ id: 'tx-neg', kind: 'adjust', delta: -2, note: 'fixing typo' }),
      ],
    });
    const out = await getRecentDeliverableActivity(admin, 'client-1');
    const pos = out.find((r) => r.id === 'tx-pos');
    const neg = out.find((r) => r.id === 'tx-neg');
    expect(pos?.headline).toBe('2 edited videos added (adjustment)');
    expect(pos?.detail).toBe('goodwill');
    expect(neg?.headline).toBe('2 edited videos removed (adjustment)');
    expect(neg?.detail).toBe('fixing typo');
  });

  it('summarises expire with the count and a trimmed note when present', async () => {
    const { admin } = makeAdmin({
      txRows: [
        tx({
          kind: 'expire',
          delta: -2,
          note: 'period rollover',
          deliverable_type_id: 'type-static',
        }),
      ],
    });
    const [entry] = await getRecentDeliverableActivity(admin, 'client-1');
    expect(entry.headline).toBe('2 static graphics expired');
    expect(entry.detail).toBe('period rollover');
  });

  it('attaches thumbnailUrl when charge_unit_kind=drop_video and the video resolves', async () => {
    const { admin } = makeAdmin({
      txRows: [
        tx({
          kind: 'consume',
          delta: -1,
          charge_unit_kind: 'drop_video',
          charge_unit_id: 'dv-99',
        }),
      ],
      dropVideoRows: [
        { id: 'dv-99', thumbnail_url: 'https://cdn.example.com/thumb.jpg' },
      ],
    });
    const [entry] = await getRecentDeliverableActivity(admin, 'client-1');
    expect(entry.thumbnailUrl).toBe('https://cdn.example.com/thumb.jpg');
  });

  it('thumbnailUrl is null when charge_unit_kind=drop_video but no row resolves', async () => {
    const { admin } = makeAdmin({
      txRows: [
        tx({
          kind: 'consume',
          delta: -1,
          charge_unit_kind: 'drop_video',
          charge_unit_id: 'dv-missing',
        }),
      ],
      dropVideoRows: [],
    });
    const [entry] = await getRecentDeliverableActivity(admin, 'client-1');
    expect(entry.thumbnailUrl).toBeNull();
  });

  it('thumbnailUrl is null when charge_unit_kind is not drop_video, even if charge_unit_id is set', async () => {
    const { admin } = makeAdmin({
      txRows: [
        tx({
          kind: 'consume',
          delta: -1,
          charge_unit_kind: 'scheduled_post',
          charge_unit_id: 'post-1',
        }),
      ],
    });
    const [entry] = await getRecentDeliverableActivity(admin, 'client-1');
    expect(entry.thumbnailUrl).toBeNull();
  });

  it('preserves the order returned by the credit_transactions read', async () => {
    const { admin } = makeAdmin({
      txRows: [
        tx({ id: 'tx-newest', created_at: '2026-04-15T12:00:00Z' }),
        tx({ id: 'tx-mid', created_at: '2026-04-14T12:00:00Z' }),
        tx({ id: 'tx-oldest', created_at: '2026-04-13T12:00:00Z' }),
      ],
    });
    const out = await getRecentDeliverableActivity(admin, 'client-1');
    expect(out.map((r) => r.id)).toEqual(['tx-newest', 'tx-mid', 'tx-oldest']);
  });
});
