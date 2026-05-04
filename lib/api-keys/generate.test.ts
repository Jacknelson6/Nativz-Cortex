import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';
import { generateApiKey, hashApiKey } from './generate';

/**
 * generateApiKey + hashApiKey mint and verify the public-API tokens
 * stored on the api_keys table. Two contracts to pin:
 *
 *   1. Plaintext format is "ntvz_" + 40 hex chars (20 random bytes).
 *      The prefix is the first 20 chars of the plaintext (= "ntvz_"
 *      plus the first 15 hex). Server-side lookup uses the prefix as
 *      a fast index, so a regression in slice length silently breaks
 *      auth on every request.
 *
 *   2. Hashing is sha256(plaintext) hex-encoded, deterministic, and
 *      identical between generateApiKey().hash and hashApiKey(plain).
 *      We never store plaintext — if these two functions ever drift,
 *      every existing key in the table becomes un-verifiable.
 */

describe('generateApiKey — format', () => {
  it('plaintext starts with "ntvz_" and is 45 chars total', () => {
    const { plaintext } = generateApiKey();
    expect(plaintext.startsWith('ntvz_')).toBe(true);
    // 5 chars prefix + 20 random bytes -> 40 hex chars = 45 total.
    expect(plaintext).toHaveLength(45);
  });

  it('the random portion is exactly 40 lowercase hex chars', () => {
    const { plaintext } = generateApiKey();
    const random = plaintext.slice('ntvz_'.length);
    expect(random).toMatch(/^[0-9a-f]{40}$/);
  });

  it('prefix is the first 20 chars of plaintext ("ntvz_" + 15 hex)', () => {
    const { plaintext, prefix } = generateApiKey();
    expect(prefix).toHaveLength(20);
    expect(prefix).toBe(plaintext.slice(0, 20));
    expect(prefix.startsWith('ntvz_')).toBe(true);
    expect(prefix.slice(5)).toMatch(/^[0-9a-f]{15}$/);
  });
});

describe('generateApiKey — hashing', () => {
  it('hash is sha256(plaintext) in hex', () => {
    const { plaintext, hash } = generateApiKey();
    const expected = createHash('sha256').update(plaintext).digest('hex');
    expect(hash).toBe(expected);
    // sha256 hex output is 64 chars.
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does NOT include plaintext in the hash output (defense in depth)', () => {
    const { plaintext, hash } = generateApiKey();
    expect(hash).not.toContain(plaintext);
    expect(hash).not.toContain(plaintext.slice('ntvz_'.length));
  });
});

describe('generateApiKey — uniqueness', () => {
  it('produces a different plaintext on every call (random bytes)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) seen.add(generateApiKey().plaintext);
    expect(seen.size).toBe(50);
  });

  it('produces a different hash on every call (no fixed-output regression)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) seen.add(generateApiKey().hash);
    expect(seen.size).toBe(50);
  });
});

describe('hashApiKey — verification helper', () => {
  it('returns the same hash as generateApiKey for a given plaintext', () => {
    const { plaintext, hash } = generateApiKey();
    expect(hashApiKey(plaintext)).toBe(hash);
  });

  it('is deterministic (same input -> same output)', () => {
    const a = hashApiKey('ntvz_deadbeef');
    const b = hashApiKey('ntvz_deadbeef');
    expect(a).toBe(b);
  });

  it('produces different hashes for different inputs', () => {
    expect(hashApiKey('ntvz_aaaa')).not.toBe(hashApiKey('ntvz_aaab'));
  });

  it('output is always 64 lowercase hex chars regardless of input', () => {
    for (const input of ['', 'x', 'ntvz_short', 'a'.repeat(1000)]) {
      const h = hashApiKey(input);
      expect(h).toHaveLength(64);
      expect(h).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
