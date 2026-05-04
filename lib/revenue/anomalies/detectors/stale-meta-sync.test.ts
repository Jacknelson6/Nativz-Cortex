import { describe, expect, it, vi } from 'vitest';
import { staleMetaSyncDetector } from './stale-meta-sync';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * staleMetaSyncDetector flags clients with a Meta ad account that hasn't
 * synced in 48h+. Three contracts to pin:
 *
 *   1. The 48-hour cutoff is computed against `Date.now()` at detect-time,
 *      not at module-load time. A naive `const cutoff = ...` at module
 *      scope would freeze the threshold to the cron's first invocation
 *      and silently stop catching new staleness over time.
 *
 *   2. A NULL `meta_ad_spend_synced_at` (never synced) is treated as
 *      stale. The query only filters by `meta_ad_account_id IS NOT NULL`,
 *      so a client linked-but-never-synced must surface — that's the
 *      worst kind of staleness.
 *
 *   3. The description field renders the last-sync timestamp via
 *      `toLocaleString('en-US')` only when present, and falls back to
 *      'Never synced.' when null. The admin UI reads this string
 *      directly; a regression that printed 'Invalid Date' would be
 *      visible but uninvestigable.
 */

type Client = {
  id: string;
  name: string;
  meta_ad_account_id: string | null;
  meta_ad_spend_synced_at: string | null;
};

function buildAdminWithClients(rows: Client[] | null): SupabaseClient {
  const not = vi.fn().mockResolvedValue({ data: rows });
  return {
    from: () => ({
      select: () => ({ not }),
    }),
  } as unknown as SupabaseClient;
}

describe('staleMetaSyncDetector — registry metadata', () => {
  it('exposes id stale_meta_sync at warning severity', () => {
    expect(staleMetaSyncDetector.id).toBe('stale_meta_sync');
    expect(staleMetaSyncDetector.severity).toBe('warning');
  });
});

describe('staleMetaSyncDetector — detect()', () => {
  it('returns [] when the query returns null (no rows / RLS blocked)', async () => {
    const out = await staleMetaSyncDetector.detect(buildAdminWithClients(null));
    expect(out).toEqual([]);
  });

  it('returns [] when no clients are linked', async () => {
    const out = await staleMetaSyncDetector.detect(buildAdminWithClients([]));
    expect(out).toEqual([]);
  });

  it('flags a client whose last sync is older than 48 hours', async () => {
    const stale = new Date(Date.now() - 60 * 60 * 60 * 1000).toISOString(); // 60h ago
    const out = await staleMetaSyncDetector.detect(
      buildAdminWithClients([
        {
          id: 'c1',
          name: 'Acme',
          meta_ad_account_id: 'act_1',
          meta_ad_spend_synced_at: stale,
        },
      ]),
    );
    expect(out).toHaveLength(1);
    expect(out[0].entity_type).toBe('client');
    expect(out[0].entity_id).toBe('c1');
    expect(out[0].client_id).toBe('c1');
    expect(out[0].title).toContain('Acme');
    expect(out[0].metadata).toMatchObject({
      meta_ad_account_id: 'act_1',
      last_synced_at: stale,
    });
  });

  it('does NOT flag a client synced within the last 48 hours', async () => {
    const fresh = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(); // 12h ago
    const out = await staleMetaSyncDetector.detect(
      buildAdminWithClients([
        {
          id: 'c1',
          name: 'Acme',
          meta_ad_account_id: 'act_1',
          meta_ad_spend_synced_at: fresh,
        },
      ]),
    );
    expect(out).toEqual([]);
  });

  it('flags a client that has NEVER synced (null timestamp) with "Never synced." description', async () => {
    const out = await staleMetaSyncDetector.detect(
      buildAdminWithClients([
        {
          id: 'c1',
          name: 'Acme',
          meta_ad_account_id: 'act_1',
          meta_ad_spend_synced_at: null,
        },
      ]),
    );
    expect(out).toHaveLength(1);
    expect(out[0].description).toBe('Never synced.');
  });

  it('renders a real-date description with the last-sync time when present', async () => {
    const stale = new Date(Date.now() - 60 * 60 * 60 * 1000).toISOString();
    const out = await staleMetaSyncDetector.detect(
      buildAdminWithClients([
        {
          id: 'c1',
          name: 'Acme',
          meta_ad_account_id: 'act_1',
          meta_ad_spend_synced_at: stale,
        },
      ]),
    );
    // Don't pin the exact locale string (it varies by node ICU version),
    // but it must NOT be the null-fallback and MUST start with "Last sync:".
    expect(out[0].description).toMatch(/^Last sync: /);
    expect(out[0].description).not.toBe('Never synced.');
  });

  it('partitions: passes fresh clients through, flags stale + never-synced together', async () => {
    const fresh = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    const stale = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
    const out = await staleMetaSyncDetector.detect(
      buildAdminWithClients([
        {
          id: 'fresh',
          name: 'Fresh Co',
          meta_ad_account_id: 'act_f',
          meta_ad_spend_synced_at: fresh,
        },
        {
          id: 'stale',
          name: 'Stale Co',
          meta_ad_account_id: 'act_s',
          meta_ad_spend_synced_at: stale,
        },
        {
          id: 'never',
          name: 'Never Co',
          meta_ad_account_id: 'act_n',
          meta_ad_spend_synced_at: null,
        },
      ]),
    );
    expect(out.map((f) => f.entity_id).sort()).toEqual(['never', 'stale']);
  });

  it('cutoff is computed at detect-time (advancing the clock changes which rows are stale)', async () => {
    // Same row, ~30h old. With a fixed real clock, this is fresh. Advance the
    // mocked clock past the 48h threshold and the same payload becomes stale.
    const syncedAt = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
    const rows: Client[] = [
      {
        id: 'c1',
        name: 'Acme',
        meta_ad_account_id: 'act_1',
        meta_ad_spend_synced_at: syncedAt,
      },
    ];

    const beforeAdvance = await staleMetaSyncDetector.detect(buildAdminWithClients(rows));
    expect(beforeAdvance).toEqual([]);

    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.parse(syncedAt) + 60 * 60 * 60 * 1000); // 60h after sync
      const afterAdvance = await staleMetaSyncDetector.detect(
        buildAdminWithClients(rows),
      );
      expect(afterAdvance).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
