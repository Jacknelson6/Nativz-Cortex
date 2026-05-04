import { describe, expect, it } from 'vitest';
import { SOFT_BLOCK_TITLE_PATTERNS, isSoftBlockedTitle } from './soft-block-rules';

/**
 * Soft-block rules decide whether a calendar event is "visible but not
 * blocking" when computing team availability. The canonical case is a
 * shoot: Jake is on set, but the rest of the team can still be booked.
 * The rule is mirrored client + server, so behaviour drift between the
 * scheduling form's pill and the Google events.list filter would let
 * the form approve a slot the server will reject.
 *
 * Two contracts to pin:
 *   1. Word boundaries — "shoot" matches as a whole word, but
 *      "shooting", "shootout", "reshoot", and "shootable" must NOT
 *      register as soft-blocks. The pattern uses \b on purpose; a
 *      regression to /shoot/i would silently soft-block half the
 *      shooting-related calendar entries.
 *   2. Case-insensitive — calendar titles are user-typed, so "Shoot",
 *      "SHOOT", "Shoot Day" all need to match.
 */

describe('isSoftBlockedTitle — positive cases (whole-word "shoot")', () => {
  it('matches the bare word "shoot"', () => {
    expect(isSoftBlockedTitle('shoot')).toBe(true);
  });

  it('matches "Shoot" with a trailing qualifier', () => {
    expect(isSoftBlockedTitle('Shoot Day')).toBe(true);
    expect(isSoftBlockedTitle('Acme Co - Shoot')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isSoftBlockedTitle('SHOOT')).toBe(true);
    expect(isSoftBlockedTitle('Shoot')).toBe(true);
    expect(isSoftBlockedTitle('shoot day')).toBe(true);
  });

  it('matches when "shoot" appears mid-string between other words', () => {
    expect(isSoftBlockedTitle('Lunch then shoot then edit')).toBe(true);
  });

  it('matches "shoot" surrounded by punctuation (still a word boundary)', () => {
    expect(isSoftBlockedTitle('Acme: shoot, ext.')).toBe(true);
  });
});

describe('isSoftBlockedTitle — negative cases (no false positives)', () => {
  it('does NOT match "shooting" (substring, not whole word)', () => {
    expect(isSoftBlockedTitle('Shooting prep')).toBe(false);
  });

  it('does NOT match "reshoot"', () => {
    expect(isSoftBlockedTitle('Reshoot for Acme')).toBe(false);
  });

  it('does NOT match "shootout"', () => {
    expect(isSoftBlockedTitle('NBA shootout watch party')).toBe(false);
  });

  it('does NOT match unrelated titles', () => {
    expect(isSoftBlockedTitle('Standup')).toBe(false);
    expect(isSoftBlockedTitle('Client call')).toBe(false);
    expect(isSoftBlockedTitle('Edit review')).toBe(false);
  });
});

describe('isSoftBlockedTitle — null/empty handling', () => {
  it('returns false for null', () => {
    expect(isSoftBlockedTitle(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isSoftBlockedTitle(undefined)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isSoftBlockedTitle('')).toBe(false);
  });

  it('returns false for whitespace-only string', () => {
    // Empty after the falsy check above; this is the next thing a real
    // calendar feed could throw at us.
    expect(isSoftBlockedTitle('   ')).toBe(false);
  });
});

describe('SOFT_BLOCK_TITLE_PATTERNS export', () => {
  it('exports a non-empty readonly array of regex patterns', () => {
    expect(Array.isArray(SOFT_BLOCK_TITLE_PATTERNS)).toBe(true);
    expect(SOFT_BLOCK_TITLE_PATTERNS.length).toBeGreaterThan(0);
    for (const re of SOFT_BLOCK_TITLE_PATTERNS) {
      expect(re).toBeInstanceOf(RegExp);
    }
  });

  it('the shoot pattern uses word boundaries and ignore-case', () => {
    // The exact source — guards against a regression to /shoot/i which
    // would silently soft-block "shooting", "reshoot", "shootout".
    const shoot = SOFT_BLOCK_TITLE_PATTERNS[0];
    expect(shoot.source).toBe('\\bshoot\\b');
    expect(shoot.flags).toContain('i');
  });
});
