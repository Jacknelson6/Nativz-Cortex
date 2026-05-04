import { describe, expect, it } from 'vitest';
import { parseAffiliateDigestRecipients } from './parse-digest-recipients';

/**
 * parseAffiliateDigestRecipients normalises the comma-separated
 * recipient list stored on affiliate digest settings (and consumed by
 * the weekly digest cron). The contract is small but easy to break:
 *
 *   - Whitespace around each address is trimmed.
 *   - Empty items (consecutive commas, trailing commas) are dropped.
 *   - null / undefined / "" / whitespace-only inputs return [].
 *
 * Why the empty-drop matters: an empty string fed into Resend's `to`
 * array fails the whole batch silently. The cron must hand off a
 * clean list or no email goes out for any recipient that week.
 */

describe('parseAffiliateDigestRecipients — empty / nullish input', () => {
  it('returns [] for null', () => {
    expect(parseAffiliateDigestRecipients(null)).toEqual([]);
  });

  it('returns [] for undefined', () => {
    expect(parseAffiliateDigestRecipients(undefined)).toEqual([]);
  });

  it('returns [] for an empty string', () => {
    expect(parseAffiliateDigestRecipients('')).toEqual([]);
  });

  it('returns [] for whitespace-only input', () => {
    expect(parseAffiliateDigestRecipients('   ')).toEqual([]);
    expect(parseAffiliateDigestRecipients('\t\n')).toEqual([]);
  });
});

describe('parseAffiliateDigestRecipients — happy path', () => {
  it('returns a single address as a single-element array', () => {
    expect(parseAffiliateDigestRecipients('a@example.com')).toEqual([
      'a@example.com',
    ]);
  });

  it('splits a comma-separated list', () => {
    expect(
      parseAffiliateDigestRecipients('a@example.com,b@example.com,c@example.com'),
    ).toEqual(['a@example.com', 'b@example.com', 'c@example.com']);
  });

  it('trims whitespace around each address', () => {
    expect(
      parseAffiliateDigestRecipients('  a@example.com ,  b@example.com  '),
    ).toEqual(['a@example.com', 'b@example.com']);
  });
});

describe('parseAffiliateDigestRecipients — empty-item filtering', () => {
  it('drops empty entries from consecutive commas', () => {
    expect(
      parseAffiliateDigestRecipients('a@example.com,,b@example.com'),
    ).toEqual(['a@example.com', 'b@example.com']);
  });

  it('drops a trailing comma cleanly', () => {
    expect(parseAffiliateDigestRecipients('a@example.com,')).toEqual([
      'a@example.com',
    ]);
  });

  it('drops a leading comma cleanly', () => {
    expect(parseAffiliateDigestRecipients(',a@example.com')).toEqual([
      'a@example.com',
    ]);
  });

  it('drops whitespace-only items between commas', () => {
    expect(
      parseAffiliateDigestRecipients('a@example.com,   ,b@example.com'),
    ).toEqual(['a@example.com', 'b@example.com']);
  });

  it('returns [] when every item is empty/whitespace', () => {
    expect(parseAffiliateDigestRecipients(',,, , ,')).toEqual([]);
  });
});

describe('parseAffiliateDigestRecipients — pass-through (no validation)', () => {
  it('does NOT validate that entries are well-formed emails', () => {
    // Validation is intentionally upstream (the form). The parser's job
    // is normalisation only — it must not silently swallow malformed
    // inputs, or the operator can't see what they typed wrong.
    expect(
      parseAffiliateDigestRecipients('not-an-email,still-not-an-email'),
    ).toEqual(['not-an-email', 'still-not-an-email']);
  });

  it('preserves duplicates (dedup is the caller responsibility)', () => {
    expect(
      parseAffiliateDigestRecipients('a@example.com,a@example.com'),
    ).toEqual(['a@example.com', 'a@example.com']);
  });
});
