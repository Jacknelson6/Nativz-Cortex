import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ADDON_ORDER,
  ADDON_SKUS,
  isAddonSlug,
  listConfiguredAddons,
  resolveAddonPriceId,
} from './addon-skus';

/**
 * Env-key resolution under test:
 *   - Per-agency prefix (NATIVZ_ / ANDERSON_) is the primary lookup.
 *   - Nativz falls back to a non-prefixed legacy var when the prefixed
 *     one is missing, single-tenant deploys still work.
 *   - Anderson does NOT get the legacy fallback (multi-tenant safety).
 *   - Empty / whitespace values are treated as "not configured".
 */

const ENV_KEYS = [
  'STRIPE_PRICE_ADDON_EDITED_VIDEO',
  'STRIPE_PRICE_ADDON_UGC_VIDEO',
  'STRIPE_PRICE_ADDON_RUSH_UPGRADE',
  'NATIVZ_STRIPE_PRICE_ADDON_EDITED_VIDEO',
  'NATIVZ_STRIPE_PRICE_ADDON_UGC_VIDEO',
  'NATIVZ_STRIPE_PRICE_ADDON_RUSH_UPGRADE',
  'ANDERSON_STRIPE_PRICE_ADDON_EDITED_VIDEO',
  'ANDERSON_STRIPE_PRICE_ADDON_UGC_VIDEO',
  'ANDERSON_STRIPE_PRICE_ADDON_RUSH_UPGRADE',
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

describe('isAddonSlug', () => {
  it('returns true for each known slug', () => {
    expect(isAddonSlug('extra_edited_video')).toBe(true);
    expect(isAddonSlug('extra_ugc_video')).toBe(true);
    expect(isAddonSlug('rush_upgrade')).toBe(true);
  });

  it('returns false for unknown strings', () => {
    expect(isAddonSlug('extra_static_graphic')).toBe(false);
    expect(isAddonSlug('')).toBe(false);
    expect(isAddonSlug('grant_topup')).toBe(false);
  });

  it('returns false for non-string values', () => {
    expect(isAddonSlug(null)).toBe(false);
    expect(isAddonSlug(undefined)).toBe(false);
    expect(isAddonSlug(42)).toBe(false);
    expect(isAddonSlug({ slug: 'extra_edited_video' })).toBe(false);
  });
});

describe('ADDON_SKUS shape (catalog invariants)', () => {
  it('keeps ADDON_ORDER aligned with ADDON_SKUS keys', () => {
    expect(new Set(ADDON_ORDER)).toEqual(new Set(Object.keys(ADDON_SKUS)));
  });

  it('marks rush_upgrade as a modifier (deliverable_type_slug = null)', () => {
    expect(ADDON_SKUS.rush_upgrade.deliverable_type_slug).toBeNull();
    expect(ADDON_SKUS.rush_upgrade.quantity).toBe(0);
  });

  it('keeps deliverable add-ons attached to a non-null type slug', () => {
    expect(ADDON_SKUS.extra_edited_video.deliverable_type_slug).toBe('edited_video');
    expect(ADDON_SKUS.extra_ugc_video.deliverable_type_slug).toBe('ugc_video');
  });
});

describe('resolveAddonPriceId', () => {
  it('reads NATIVZ_ prefix for nativz', () => {
    process.env.NATIVZ_STRIPE_PRICE_ADDON_EDITED_VIDEO = 'price_natz_edit';
    expect(resolveAddonPriceId('nativz', 'extra_edited_video')).toBe(
      'price_natz_edit',
    );
  });

  it('reads ANDERSON_ prefix for anderson', () => {
    process.env.ANDERSON_STRIPE_PRICE_ADDON_UGC_VIDEO = 'price_ac_ugc';
    expect(resolveAddonPriceId('anderson', 'extra_ugc_video')).toBe(
      'price_ac_ugc',
    );
  });

  it('falls back to the unprefixed legacy var for nativz', () => {
    process.env.STRIPE_PRICE_ADDON_RUSH_UPGRADE = 'price_legacy_rush';
    expect(resolveAddonPriceId('nativz', 'rush_upgrade')).toBe(
      'price_legacy_rush',
    );
  });

  it('does NOT fall back to the legacy var for anderson (multi-tenant safety)', () => {
    process.env.STRIPE_PRICE_ADDON_RUSH_UPGRADE = 'price_legacy_rush';
    expect(resolveAddonPriceId('anderson', 'rush_upgrade')).toBeNull();
  });

  it('prefers the per-agency var over the legacy var on nativz', () => {
    process.env.NATIVZ_STRIPE_PRICE_ADDON_EDITED_VIDEO = 'price_prefix';
    process.env.STRIPE_PRICE_ADDON_EDITED_VIDEO = 'price_legacy';
    expect(resolveAddonPriceId('nativz', 'extra_edited_video')).toBe(
      'price_prefix',
    );
  });

  it('returns null when no env var is set', () => {
    expect(resolveAddonPriceId('nativz', 'extra_edited_video')).toBeNull();
    expect(resolveAddonPriceId('anderson', 'extra_edited_video')).toBeNull();
  });

  it('treats whitespace-only env values as unconfigured', () => {
    process.env.NATIVZ_STRIPE_PRICE_ADDON_EDITED_VIDEO = '   ';
    expect(resolveAddonPriceId('nativz', 'extra_edited_video')).toBeNull();
  });

  it('trims surrounding whitespace from configured prices', () => {
    process.env.NATIVZ_STRIPE_PRICE_ADDON_EDITED_VIDEO = '  price_padded  ';
    expect(resolveAddonPriceId('nativz', 'extra_edited_video')).toBe(
      'price_padded',
    );
  });
});

describe('listConfiguredAddons', () => {
  it('returns an empty array when no add-on env vars are set', () => {
    expect(listConfiguredAddons('nativz')).toEqual([]);
    expect(listConfiguredAddons('anderson')).toEqual([]);
  });

  it('returns only the SKUs whose env var is configured for the agency', () => {
    process.env.NATIVZ_STRIPE_PRICE_ADDON_EDITED_VIDEO = 'price_a';
    process.env.NATIVZ_STRIPE_PRICE_ADDON_RUSH_UPGRADE = 'price_b';
    const slugs = listConfiguredAddons('nativz').map((s) => s.slug);
    expect(slugs).toEqual(['extra_edited_video', 'rush_upgrade']);
  });

  it('isolates Anderson configuration from Nativz configuration', () => {
    process.env.ANDERSON_STRIPE_PRICE_ADDON_UGC_VIDEO = 'price_ac';
    expect(listConfiguredAddons('anderson').map((s) => s.slug)).toEqual([
      'extra_ugc_video',
    ]);
    // No Nativz prefix set, so the same env should NOT bleed into Nativz.
    expect(listConfiguredAddons('nativz')).toEqual([]);
  });

  it('preserves ADDON_ORDER ordering in the returned list', () => {
    process.env.NATIVZ_STRIPE_PRICE_ADDON_RUSH_UPGRADE = 'price_a';
    process.env.NATIVZ_STRIPE_PRICE_ADDON_EDITED_VIDEO = 'price_b';
    process.env.NATIVZ_STRIPE_PRICE_ADDON_UGC_VIDEO = 'price_c';
    expect(listConfiguredAddons('nativz').map((s) => s.slug)).toEqual([
      'extra_edited_video',
      'extra_ugc_video',
      'rush_upgrade',
    ]);
  });
});
