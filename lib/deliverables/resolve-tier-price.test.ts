import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  resolveTierByPriceId,
  resolveTierPriceIdByEnvKey,
} from './resolve-tier-price';

/**
 * Env-key resolution under test mirrors `addon-skus.ts`:
 *   - Per-agency prefix (NATIVZ_ / ANDERSON_) is the primary lookup.
 *   - Nativz falls back to a non-prefixed legacy var, single-tenant deploys
 *     should not need the prefix.
 *   - Anderson does NOT fall back (multi-tenant safety, an Anderson webhook
 *     must never resolve through a Nativz-shaped legacy var).
 *   - Empty / whitespace values are treated as "not configured."
 */

const ENV_KEYS = [
  'STRIPE_PRICE_TIER_GROWTH',
  'STRIPE_PRICE_TIER_SIGNATURE',
  'NATIVZ_STRIPE_PRICE_TIER_GROWTH',
  'NATIVZ_STRIPE_PRICE_TIER_SIGNATURE',
  'ANDERSON_STRIPE_PRICE_TIER_GROWTH',
  'ANDERSON_STRIPE_PRICE_TIER_SIGNATURE',
];

const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    originalEnv[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (originalEnv[k] === undefined) delete process.env[k];
    else process.env[k] = originalEnv[k];
  }
});

describe('resolveTierPriceIdByEnvKey', () => {
  it('reads NATIVZ_ prefix for nativz', () => {
    process.env.NATIVZ_STRIPE_PRICE_TIER_GROWTH = 'price_natz_growth';
    expect(
      resolveTierPriceIdByEnvKey('nativz', 'STRIPE_PRICE_TIER_GROWTH'),
    ).toBe('price_natz_growth');
  });

  it('reads ANDERSON_ prefix for anderson', () => {
    process.env.ANDERSON_STRIPE_PRICE_TIER_SIGNATURE = 'price_ac_sig';
    expect(
      resolveTierPriceIdByEnvKey('anderson', 'STRIPE_PRICE_TIER_SIGNATURE'),
    ).toBe('price_ac_sig');
  });

  it('falls back to the unprefixed legacy var for nativz only', () => {
    process.env.STRIPE_PRICE_TIER_GROWTH = 'price_legacy_growth';
    expect(
      resolveTierPriceIdByEnvKey('nativz', 'STRIPE_PRICE_TIER_GROWTH'),
    ).toBe('price_legacy_growth');
  });

  it('does NOT fall back to the legacy var for anderson', () => {
    process.env.STRIPE_PRICE_TIER_GROWTH = 'price_legacy_growth';
    expect(
      resolveTierPriceIdByEnvKey('anderson', 'STRIPE_PRICE_TIER_GROWTH'),
    ).toBeNull();
  });

  it('prefers per-agency env over legacy on nativz', () => {
    process.env.NATIVZ_STRIPE_PRICE_TIER_GROWTH = 'price_prefix';
    process.env.STRIPE_PRICE_TIER_GROWTH = 'price_legacy';
    expect(
      resolveTierPriceIdByEnvKey('nativz', 'STRIPE_PRICE_TIER_GROWTH'),
    ).toBe('price_prefix');
  });

  it('returns null when nothing is set', () => {
    expect(
      resolveTierPriceIdByEnvKey('nativz', 'STRIPE_PRICE_TIER_GROWTH'),
    ).toBeNull();
    expect(
      resolveTierPriceIdByEnvKey('anderson', 'STRIPE_PRICE_TIER_GROWTH'),
    ).toBeNull();
  });

  it('treats whitespace-only env values as unconfigured', () => {
    process.env.NATIVZ_STRIPE_PRICE_TIER_GROWTH = '   ';
    expect(
      resolveTierPriceIdByEnvKey('nativz', 'STRIPE_PRICE_TIER_GROWTH'),
    ).toBeNull();
  });

  it('trims surrounding whitespace from configured prices', () => {
    process.env.ANDERSON_STRIPE_PRICE_TIER_GROWTH = '  price_padded  ';
    expect(
      resolveTierPriceIdByEnvKey('anderson', 'STRIPE_PRICE_TIER_GROWTH'),
    ).toBe('price_padded');
  });
});

interface TierRow {
  id: string;
  slug: string;
  env_key: string | null;
}

function makeAdmin(rows: TierRow[]): SupabaseClient {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    returns: vi.fn(async () => ({ data: rows, error: null })),
  };
  // The chain is awaited at the .returns() call, so make the chain object
  // itself thenable to mirror Supabase's PostgREST builder.
  // (Tests await admin.from('package_tiers').select(...).eq(...).eq(...).returns())
  const fromMock = vi.fn((table: string) => {
    if (table !== 'package_tiers') {
      throw new Error(`unexpected table: ${table}`);
    }
    return builder;
  });
  return { from: fromMock } as unknown as SupabaseClient;
}

describe('resolveTierByPriceId', () => {
  it('returns the matching tier row when a price id resolves through the env', async () => {
    process.env.NATIVZ_STRIPE_PRICE_TIER_GROWTH = 'price_match';
    const admin = makeAdmin([
      { id: 'tier-growth', slug: 'growth', env_key: 'STRIPE_PRICE_TIER_GROWTH' },
      { id: 'tier-sig', slug: 'signature', env_key: 'STRIPE_PRICE_TIER_SIGNATURE' },
    ]);
    expect(await resolveTierByPriceId(admin, 'nativz', 'price_match')).toEqual({
      id: 'tier-growth',
      slug: 'growth',
    });
  });

  it('returns null when no tier env resolves to the given price id', async () => {
    process.env.NATIVZ_STRIPE_PRICE_TIER_GROWTH = 'price_other';
    const admin = makeAdmin([
      { id: 'tier-growth', slug: 'growth', env_key: 'STRIPE_PRICE_TIER_GROWTH' },
    ]);
    expect(
      await resolveTierByPriceId(admin, 'nativz', 'price_unknown'),
    ).toBeNull();
  });

  it('skips tier rows whose env_key is null', async () => {
    process.env.NATIVZ_STRIPE_PRICE_TIER_SIGNATURE = 'price_sig';
    const admin = makeAdmin([
      { id: 'tier-starter', slug: 'starter', env_key: null },
      { id: 'tier-sig', slug: 'signature', env_key: 'STRIPE_PRICE_TIER_SIGNATURE' },
    ]);
    expect(await resolveTierByPriceId(admin, 'nativz', 'price_sig')).toEqual({
      id: 'tier-sig',
      slug: 'signature',
    });
  });

  it('returns null when there are no active tiers at all', async () => {
    const admin = makeAdmin([]);
    expect(
      await resolveTierByPriceId(admin, 'nativz', 'price_anything'),
    ).toBeNull();
  });

  it('respects agency isolation (nativz price never matches an anderson lookup)', async () => {
    process.env.NATIVZ_STRIPE_PRICE_TIER_GROWTH = 'price_natz';
    const admin = makeAdmin([
      { id: 'tier-growth', slug: 'growth', env_key: 'STRIPE_PRICE_TIER_GROWTH' },
    ]);
    // Anderson lookup with a Nativz-only price set: must NOT resolve.
    expect(
      await resolveTierByPriceId(admin, 'anderson', 'price_natz'),
    ).toBeNull();
  });
});
