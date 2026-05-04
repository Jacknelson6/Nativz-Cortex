import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getDeliverableTypeId,
  getDeliverableTypeSlug,
  invalidateDeliverableTypesCache,
  listDeliverableTypes,
} from './types-cache';

/**
 * deliverable_types cache under test.
 *
 * Invariants:
 *   1. The cache is process-local; the test suite must invalidate before each
 *      test to reset it.
 *   2. Inside the 60s TTL the underlying Supabase read happens at most once.
 *   3. Concurrent calls during a fresh state share a single in-flight read
 *      (stampede protection).
 *   4. Reading the column `label_singular` and exposing it as `display_name`
 *      is intentional, the live DB column has the original name.
 *   5. Unknown slug / id throw, callers should fail loud rather than silently
 *      defaulting.
 */

interface TypeRow {
  id: string;
  slug: string;
  label_singular: string;
  sort_order: number;
  is_active: boolean;
}

const ROWS: TypeRow[] = [
  {
    id: 'type-edited',
    slug: 'edited_video',
    label_singular: 'Edited Video',
    sort_order: 10,
    is_active: true,
  },
  {
    id: 'type-ugc',
    slug: 'ugc_video',
    label_singular: 'UGC Video',
    sort_order: 20,
    is_active: true,
  },
  {
    id: 'type-static',
    slug: 'static_graphic',
    label_singular: 'Static Graphic',
    sort_order: 30,
    is_active: true,
  },
];

function makeAdmin(opts: {
  rows?: TypeRow[];
  error?: { message: string };
  delayMs?: number;
}): { admin: SupabaseClient; returnsCalls: () => number } {
  let calls = 0;
  const fromMock = vi.fn((table: string) => {
    if (table !== 'deliverable_types') {
      throw new Error(`unexpected table: ${table}`);
    }
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      returns: vi.fn(async () => {
        calls++;
        if (opts.delayMs) {
          await new Promise<void>((r) => setTimeout(r, opts.delayMs));
        }
        return {
          data: opts.error ? null : opts.rows ?? ROWS,
          error: opts.error ?? null,
        };
      }),
    };
    return builder;
  });
  return {
    admin: { from: fromMock } as unknown as SupabaseClient,
    returnsCalls: () => calls,
  };
}

beforeEach(() => {
  invalidateDeliverableTypesCache();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getDeliverableTypeId', () => {
  it('resolves a known slug to its id', async () => {
    const { admin } = makeAdmin({});
    expect(await getDeliverableTypeId(admin, 'edited_video')).toBe('type-edited');
    expect(await getDeliverableTypeId(admin, 'ugc_video')).toBe('type-ugc');
  });

  it('throws when the slug is unknown', async () => {
    const { admin } = makeAdmin({ rows: [ROWS[0]] }); // only edited_video
    await expect(
      getDeliverableTypeId(admin, 'ugc_video'),
    ).rejects.toThrow(/Unknown deliverable type slug: ugc_video/);
  });

  it('throws a descriptive error when the underlying read fails', async () => {
    const { admin } = makeAdmin({ error: { message: 'rls blocked' } });
    await expect(
      getDeliverableTypeId(admin, 'edited_video'),
    ).rejects.toThrow(/deliverable_types fetch failed: rls blocked/);
  });
});

describe('getDeliverableTypeSlug', () => {
  it('resolves a known id to its slug', async () => {
    const { admin } = makeAdmin({});
    expect(await getDeliverableTypeSlug(admin, 'type-edited')).toBe('edited_video');
    expect(await getDeliverableTypeSlug(admin, 'type-static')).toBe('static_graphic');
  });

  it('throws when the id is unknown', async () => {
    const { admin } = makeAdmin({});
    await expect(
      getDeliverableTypeSlug(admin, 'type-nonexistent'),
    ).rejects.toThrow(/Unknown deliverable type id: type-nonexistent/);
  });
});

describe('listDeliverableTypes', () => {
  it('returns every active type sorted by sort_order ascending', async () => {
    const { admin } = makeAdmin({
      // Insert out-of-order to prove the function sorts.
      rows: [ROWS[2], ROWS[0], ROWS[1]],
    });
    const types = await listDeliverableTypes(admin);
    expect(types.map((t) => t.slug)).toEqual([
      'edited_video',
      'ugc_video',
      'static_graphic',
    ]);
    expect(types.map((t) => t.sort_order)).toEqual([10, 20, 30]);
  });

  it('renames label_singular to display_name in the returned shape', async () => {
    const { admin } = makeAdmin({});
    const types = await listDeliverableTypes(admin);
    expect(types.find((t) => t.slug === 'edited_video')?.display_name).toBe(
      'Edited Video',
    );
  });
});

describe('cache TTL and stampede protection', () => {
  it('serves repeated calls inside the 60s TTL from cache (one underlying read)', async () => {
    const { admin, returnsCalls } = makeAdmin({});
    await getDeliverableTypeId(admin, 'edited_video');
    await getDeliverableTypeId(admin, 'ugc_video');
    await listDeliverableTypes(admin);
    expect(returnsCalls()).toBe(1);
  });

  it('refetches after the cache is explicitly invalidated', async () => {
    const { admin, returnsCalls } = makeAdmin({});
    await getDeliverableTypeId(admin, 'edited_video');
    expect(returnsCalls()).toBe(1);
    invalidateDeliverableTypesCache();
    await getDeliverableTypeId(admin, 'edited_video');
    expect(returnsCalls()).toBe(2);
  });

  it('refetches once the 60s TTL elapses', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-01T00:00:00Z'));
    const { admin, returnsCalls } = makeAdmin({});
    await getDeliverableTypeId(admin, 'edited_video');
    expect(returnsCalls()).toBe(1);

    // 30s later: still cached
    vi.setSystemTime(new Date('2026-04-01T00:00:30Z'));
    await getDeliverableTypeId(admin, 'edited_video');
    expect(returnsCalls()).toBe(1);

    // 61s later: TTL exceeded -> refetch
    vi.setSystemTime(new Date('2026-04-01T00:01:01Z'));
    await getDeliverableTypeId(admin, 'edited_video');
    expect(returnsCalls()).toBe(2);
  });

  it('shares a single in-flight read across concurrent first-fetch callers', async () => {
    // delayMs=10 makes the first read overlap with the second so we can
    // observe stampede protection (both awaits resolve from the SAME promise).
    const { admin, returnsCalls } = makeAdmin({ delayMs: 10 });
    const [a, b, c] = await Promise.all([
      getDeliverableTypeId(admin, 'edited_video'),
      getDeliverableTypeId(admin, 'ugc_video'),
      listDeliverableTypes(admin),
    ]);
    expect(a).toBe('type-edited');
    expect(b).toBe('type-ugc');
    expect(c).toHaveLength(3);
    expect(returnsCalls()).toBe(1);
  });
});
