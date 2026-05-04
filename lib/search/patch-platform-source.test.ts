import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { patchPlatformSourceInSearch } from './patch-platform-source';
import type { PlatformSource } from '@/lib/types/search';

/**
 * patchPlatformSourceInSearch is the only writer for nested fields on
 * `topic_searches.platform_data.sources[]`. Three contracts to pin:
 *
 *   1. Find-by-(platform, id), not by id alone. The same `id` can
 *      appear under different platforms (e.g. a Reddit post and a
 *      YouTube clip mirroring the same external slug). Matching on id
 *      alone would silently overwrite the wrong source.
 *
 *   2. Preserve sibling keys on `platform_data`. The merge spreads
 *      `pd` first then overrides `sources` so unrelated keys (cached
 *      cost, run metadata) survive a thumbnail patch. A regression
 *      here would wipe out fields the search route stamps once and
 *      never re-derives.
 *
 *   3. Defensive on missing/non-array sources. A search row that
 *      somehow lost its `platform_data.sources` array should 404 the
 *      patch, not crash with `findIndex` of undefined.
 */

interface FetchResult {
  data: { platform_data: unknown } | null;
  error: { message: string } | null;
}

function makeAdmin(opts: {
  fetch: FetchResult;
  updateError?: { message: string } | null;
}) {
  const updateCalls: Array<{ payload: unknown; eqId: string }> = [];

  const selectChain = {
    select: vi.fn(() => selectChain),
    eq: vi.fn(() => selectChain),
    single: vi.fn(() => Promise.resolve(opts.fetch)),
  };

  const updateChain = {
    update: vi.fn((payload: unknown) => updateChain),
    eq: vi.fn((_col: string, value: string) => {
      const lastUpdatePayload = (updateChain.update as ReturnType<typeof vi.fn>).mock
        .calls.at(-1)?.[0];
      updateCalls.push({ payload: lastUpdatePayload, eqId: value });
      return Promise.resolve({ error: opts.updateError ?? null });
    }),
  };

  let fromCallIdx = 0;
  const admin = {
    from: vi.fn(() => {
      fromCallIdx += 1;
      return fromCallIdx === 1 ? selectChain : updateChain;
    }),
  } as unknown as SupabaseClient;

  return { admin, updateCalls };
}

const baseSource = (overrides: Partial<PlatformSource> = {}): PlatformSource =>
  ({
    platform: 'youtube',
    id: 'src-1',
    url: 'https://example.com/src-1',
    title: 'Original title',
    content: '',
    author: '',
    engagement: {},
    createdAt: '2026-01-01T00:00:00Z',
    comments: [],
    ...overrides,
  }) as PlatformSource;

describe('patchPlatformSourceInSearch — fetch failures', () => {
  it('returns 404 when the search row is not found (error path)', async () => {
    const { admin } = makeAdmin({
      fetch: { data: null, error: { message: 'not found' } },
    });
    const out = await patchPlatformSourceInSearch(admin, 's1', 'youtube', 'src-1', {
      title: 'New',
    });
    expect(out).toEqual({ ok: false, error: 'Search not found', status: 404 });
  });

  it('returns 404 when the search row is null (no error, no data)', async () => {
    const { admin } = makeAdmin({ fetch: { data: null, error: null } });
    const out = await patchPlatformSourceInSearch(admin, 's1', 'youtube', 'src-1', {});
    expect(out).toEqual({ ok: false, error: 'Search not found', status: 404 });
  });
});

describe('patchPlatformSourceInSearch — source lookup', () => {
  it('returns 404 when sources is missing entirely', async () => {
    const { admin } = makeAdmin({
      fetch: { data: { platform_data: {} }, error: null },
    });
    const out = await patchPlatformSourceInSearch(admin, 's1', 'youtube', 'src-1', {
      title: 'x',
    });
    expect(out).toEqual({
      ok: false,
      error: 'Source not found on this search',
      status: 404,
    });
  });

  it('returns 404 when platform_data is null', async () => {
    const { admin } = makeAdmin({
      fetch: { data: { platform_data: null }, error: null },
    });
    const out = await patchPlatformSourceInSearch(admin, 's1', 'youtube', 'src-1', {
      title: 'x',
    });
    expect(out).toEqual({
      ok: false,
      error: 'Source not found on this search',
      status: 404,
    });
  });

  it('returns 404 when sources is a non-array (defensive)', async () => {
    const { admin } = makeAdmin({
      fetch: { data: { platform_data: { sources: 'oops' } }, error: null },
    });
    const out = await patchPlatformSourceInSearch(admin, 's1', 'youtube', 'src-1', {
      title: 'x',
    });
    expect(out).toEqual({
      ok: false,
      error: 'Source not found on this search',
      status: 404,
    });
  });

  it('returns 404 when no row matches both platform AND id', async () => {
    const sources = [
      baseSource({ platform: 'reddit', id: 'src-1' }),
      baseSource({ platform: 'youtube', id: 'other' }),
    ];
    const { admin } = makeAdmin({
      fetch: { data: { platform_data: { sources } }, error: null },
    });
    const out = await patchPlatformSourceInSearch(admin, 's1', 'youtube', 'src-1', {
      title: 'x',
    });
    expect(out).toEqual({
      ok: false,
      error: 'Source not found on this search',
      status: 404,
    });
  });

  it('matches on (platform, id) tuple, not id alone', async () => {
    const sources = [
      baseSource({ platform: 'reddit', id: 'shared', title: 'Reddit version' }),
      baseSource({ platform: 'youtube', id: 'shared', title: 'YouTube version' }),
    ];
    const { admin, updateCalls } = makeAdmin({
      fetch: { data: { platform_data: { sources } }, error: null },
    });
    const out = await patchPlatformSourceInSearch(
      admin,
      's1',
      'youtube',
      'shared',
      { title: 'Patched' },
    );
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error('expected ok');
    expect(out.updated.platform).toBe('youtube');
    expect(out.updated.title).toBe('Patched');

    const written = (updateCalls[0].payload as { platform_data: { sources: PlatformSource[] } })
      .platform_data.sources;
    expect(written.find((s) => s.platform === 'reddit')?.title).toBe('Reddit version');
    expect(written.find((s) => s.platform === 'youtube')?.title).toBe('Patched');
  });
});

describe('patchPlatformSourceInSearch — successful merge', () => {
  it('merges patch fields onto the existing source and returns ok+updated', async () => {
    const sources = [
      baseSource({
        platform: 'youtube',
        id: 'src-1',
        title: 'Old title',
        thumbnailUrl: 'https://cdn/old.jpg',
      }),
    ];
    const { admin, updateCalls } = makeAdmin({
      fetch: { data: { platform_data: { sources } }, error: null },
    });
    const out = await patchPlatformSourceInSearch(admin, 's1', 'youtube', 'src-1', {
      title: 'New title',
    });
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error('expected ok');
    expect(out.updated.title).toBe('New title');
    expect(out.updated.thumbnailUrl).toBe('https://cdn/old.jpg');
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].eqId).toBe('s1');
  });

  it('preserves sibling keys on platform_data (does not wipe non-sources fields)', async () => {
    const sources = [baseSource({ platform: 'youtube', id: 'src-1' })];
    const { admin, updateCalls } = makeAdmin({
      fetch: {
        data: {
          platform_data: {
            sources,
            cached_cost_usd: 0.42,
            run_meta: { started_at: '2026-01-01T00:00:00Z' },
          },
        },
        error: null,
      },
    });
    await patchPlatformSourceInSearch(admin, 's1', 'youtube', 'src-1', { title: 'x' });
    const payload = updateCalls[0].payload as {
      platform_data: Record<string, unknown>;
    };
    expect(payload.platform_data.cached_cost_usd).toBe(0.42);
    expect(payload.platform_data.run_meta).toEqual({
      started_at: '2026-01-01T00:00:00Z',
    });
  });

  it('does not mutate the originally-fetched sources array', async () => {
    const original = baseSource({ platform: 'youtube', id: 'src-1', title: 'Old' });
    const sources = [original];
    const { admin } = makeAdmin({
      fetch: { data: { platform_data: { sources } }, error: null },
    });
    await patchPlatformSourceInSearch(admin, 's1', 'youtube', 'src-1', { title: 'New' });
    expect(original.title).toBe('Old');
    expect(sources[0].title).toBe('Old');
  });
});

describe('patchPlatformSourceInSearch — update failures', () => {
  it('returns 500 with the supabase error message when update fails', async () => {
    const sources = [baseSource({ platform: 'youtube', id: 'src-1' })];
    const { admin } = makeAdmin({
      fetch: { data: { platform_data: { sources } }, error: null },
      updateError: { message: 'permission denied' },
    });
    const out = await patchPlatformSourceInSearch(admin, 's1', 'youtube', 'src-1', {
      title: 'x',
    });
    expect(out).toEqual({ ok: false, error: 'permission denied', status: 500 });
  });

  it('falls back to "Update failed" when the error has no message', async () => {
    const sources = [baseSource({ platform: 'youtube', id: 'src-1' })];
    const { admin } = makeAdmin({
      fetch: { data: { platform_data: { sources } }, error: null },
      updateError: { message: '' },
    });
    const out = await patchPlatformSourceInSearch(admin, 's1', 'youtube', 'src-1', {
      title: 'x',
    });
    expect(out).toEqual({ ok: false, error: 'Update failed', status: 500 });
  });
});
