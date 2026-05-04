import { describe, expect, it } from 'vitest';
import { inferScopeTier, scopeTierBySlug } from './scope';
import type { DeliverableBalance } from './get-balances';

/**
 * Heuristic ladder under test (until Phase D promotes package_tier_slug):
 *   total monthly allowance == 0                  → starter
 *   total monthly allowance <= 10                 → starter
 *   total monthly allowance <= 25                 → growth
 *   total monthly allowance <= 60                 → signature
 *   total monthly allowance > 60                  → enterprise
 *
 * `hasRow: false` placeholders are excluded from the sum, that's the
 * invariant that lets a brand-new client land on starter instead of
 * the placeholder allowances inflating their tier.
 */

function bal(
  slug: DeliverableBalance['deliverableTypeSlug'],
  monthlyAllowance: number,
  hasRow = true,
): DeliverableBalance {
  return {
    deliverableTypeId: `type-${slug}`,
    deliverableTypeSlug: slug,
    displayName: slug,
    sortOrder: 0,
    hasRow,
    currentBalance: 0,
    monthlyAllowance,
    rolloverPolicy: 'none',
    rolloverCap: null,
    autoGrantEnabled: true,
    pausedUntil: null,
    pauseReason: null,
    periodStartedAt: null,
    nextResetAt: null,
  };
}

describe('inferScopeTier', () => {
  it('returns starter for an empty balance set (unprovisioned account)', () => {
    expect(inferScopeTier([]).slug).toBe('starter');
  });

  it('returns starter when only placeholder rows exist (hasRow=false)', () => {
    const result = inferScopeTier([
      bal('edited_video', 50, false),
      bal('ugc_video', 50, false),
    ]);
    expect(result.slug).toBe('starter');
  });

  it('returns starter at the upper boundary of 10', () => {
    expect(inferScopeTier([bal('edited_video', 10)]).slug).toBe('starter');
  });

  it('returns growth at 11 (just above starter)', () => {
    expect(inferScopeTier([bal('edited_video', 11)]).slug).toBe('growth');
  });

  it('returns growth at the upper boundary of 25', () => {
    expect(inferScopeTier([bal('edited_video', 25)]).slug).toBe('growth');
  });

  it('returns signature at 26 (just above growth)', () => {
    expect(inferScopeTier([bal('edited_video', 26)]).slug).toBe('signature');
  });

  it('returns signature at the upper boundary of 60', () => {
    expect(inferScopeTier([bal('edited_video', 60)]).slug).toBe('signature');
  });

  it('returns enterprise at 61 (just above signature)', () => {
    expect(inferScopeTier([bal('edited_video', 61)]).slug).toBe('enterprise');
  });

  it('returns enterprise for a high combined allowance', () => {
    const result = inferScopeTier([
      bal('edited_video', 40),
      bal('ugc_video', 40),
      bal('static_graphic', 40),
    ]);
    expect(result.slug).toBe('enterprise');
  });

  it('sums allowances across deliverable types', () => {
    // 8 + 8 = 16 -> growth bucket
    const result = inferScopeTier([
      bal('edited_video', 8),
      bal('ugc_video', 8),
    ]);
    expect(result.slug).toBe('growth');
  });

  it('mixes hasRow=true and hasRow=false correctly (only counts real rows)', () => {
    // Real 6 + placeholder 100 -> starter (6 <= 10)
    const result = inferScopeTier([
      bal('edited_video', 6, true),
      bal('ugc_video', 100, false),
    ]);
    expect(result.slug).toBe('starter');
  });
});

describe('scopeTierBySlug', () => {
  it('returns the matching tier definition with inclusions and outOfScope', () => {
    const tier = scopeTierBySlug('growth');
    expect(tier.slug).toBe('growth');
    expect(tier.label).toBe('Growth');
    expect(tier.inclusions.edited_video).toBeDefined();
    expect(tier.outOfScope.length).toBeGreaterThan(0);
  });

  it('returns the enterprise tier with the per-contract blurb', () => {
    const tier = scopeTierBySlug('enterprise');
    expect(tier.slug).toBe('enterprise');
    expect(tier.outOfScope).toEqual([
      'anything outside the signed scope of work',
    ]);
  });

  it('starter and growth differ in their inclusion sets', () => {
    const starter = scopeTierBySlug('starter');
    const growth = scopeTierBySlug('growth');
    // Growth adds ugc_video coverage that starter does not include.
    expect(starter.inclusions.ugc_video).toBeUndefined();
    expect(growth.inclusions.ugc_video).toBeDefined();
  });
});
