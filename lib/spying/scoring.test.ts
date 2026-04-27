import { describe, expect, it } from 'vitest';
import {
  PLATFORM_WEIGHTS,
  VELOCITY_PAR_POSTS_PER_MONTH,
  brandScore,
  composePlatformScore,
  scoreEngagement,
  scoreReach,
  scoreVelocity,
} from './scoring';

describe('scoreVelocity', () => {
  it('zero posts → 0', () => {
    expect(scoreVelocity(0)).toBe(0);
    expect(scoreVelocity(-1)).toBe(0);
  });

  it('par cadence (8/mo) → 75', () => {
    expect(scoreVelocity(VELOCITY_PAR_POSTS_PER_MONTH)).toBe(75);
  });

  it('linear ramp below par', () => {
    expect(scoreVelocity(4)).toBeCloseTo(37.5, 1);
    expect(scoreVelocity(2)).toBeCloseTo(18.75, 1);
  });

  it('asymptotic above par — never exceeds 100', () => {
    expect(scoreVelocity(16)).toBeGreaterThan(75);
    expect(scoreVelocity(16)).toBeLessThan(95);
    expect(scoreVelocity(40)).toBeGreaterThan(90);
    expect(scoreVelocity(1000)).toBeLessThanOrEqual(100);
  });
});

describe('scoreEngagement', () => {
  it('zero → 0', () => expect(scoreEngagement(0)).toBe(0));
  it('100 → 50', () => expect(scoreEngagement(100)).toBeCloseTo(50, 1));
  it('1k → 75', () => expect(scoreEngagement(1000)).toBeCloseTo(75, 1));
  it('10k → 100', () => expect(scoreEngagement(10000)).toBeCloseTo(100, 1));
  it('caps at 100', () => expect(scoreEngagement(1_000_000)).toBe(100));
});

describe('scoreReach', () => {
  it('zero → 0', () => expect(scoreReach(0)).toBe(0));
  it('1k → ~50', () => expect(scoreReach(1000)).toBeCloseTo(50, 0));
  it('100k → ~83', () => expect(scoreReach(100_000)).toBeCloseTo(83, 0));
  it('1M → 100', () => expect(scoreReach(1_000_000)).toBeCloseTo(100, 1));
  it('caps at 100', () => expect(scoreReach(50_000_000)).toBe(100));
});

describe('PLATFORM_WEIGHTS', () => {
  it('every platform sums to 1.0', () => {
    for (const [platform, w] of Object.entries(PLATFORM_WEIGHTS)) {
      const total = w.velocity + w.engagement + w.reach + w.bio + w.caption;
      expect(total, `${platform} weights must sum to 1`).toBeCloseTo(1, 6);
    }
  });

  it('TikTok bio weight is 0 (redistributed)', () => {
    expect(PLATFORM_WEIGHTS.tiktok.bio).toBe(0);
  });

  it('IG velocity is 40%', () => {
    expect(PLATFORM_WEIGHTS.instagram.velocity).toBe(0.4);
  });

  it('TikTok velocity is 50% (gets the bio redistribution)', () => {
    expect(PLATFORM_WEIGHTS.tiktok.velocity).toBe(0.5);
  });
});

describe('composePlatformScore', () => {
  it('all-perfect components → 100', () => {
    const composite = composePlatformScore('instagram', {
      velocity: 100, engagement: 100, reach: 100, bio: 100, caption: 100,
    });
    expect(composite).toBe(100);
  });

  it('all-zero components → 0', () => {
    expect(composePlatformScore('tiktok', {
      velocity: 0, engagement: 0, reach: 0, bio: 0, caption: 0,
    })).toBe(0);
  });

  it('TikTok ignores bio score', () => {
    const withBio = composePlatformScore('tiktok', {
      velocity: 50, engagement: 50, reach: 50, bio: 100, caption: 50,
    });
    const withoutBio = composePlatformScore('tiktok', {
      velocity: 50, engagement: 50, reach: 50, bio: 0, caption: 50,
    });
    expect(withBio).toEqual(withoutBio);
  });

  it('IG bio is worth 20% of composite', () => {
    const withBio = composePlatformScore('instagram', {
      velocity: 0, engagement: 0, reach: 0, bio: 100, caption: 0,
    });
    expect(withBio).toBeCloseTo(20, 6);
  });
});

describe('brandScore', () => {
  it('empty → 0', () => expect(brandScore([])).toBe(0));

  it('single platform → that platform’s composite', () => {
    expect(brandScore([
      { platform: 'instagram', composite: 80, components: zero() },
    ])).toBe(80);
  });

  it('average of two platforms', () => {
    expect(brandScore([
      { platform: 'instagram', composite: 80, components: zero() },
      { platform: 'tiktok', composite: 40, components: zero() },
    ])).toBe(60);
  });
});

function zero() {
  return { velocity: 0, engagement: 0, reach: 0, bio: 0, caption: 0 };
}
