import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';
import { decrypt, decryptToken, encrypt, isEncrypted } from './crypto';

/**
 * lib/crypto.ts encrypts every OAuth token Cortex stores (Zernio,
 * Google, Mux, Calendar). The contracts under test:
 *
 *   1. encrypt → decrypt round-trips losslessly. The output format is
 *      "iv:ciphertext:authTag" hex segments. IVs MUST be random per
 *      call so the same plaintext encrypts to different outputs.
 *
 *   2. decrypt is backwards-compatible with plaintext tokens written
 *      before the encryption migration: a value that doesn't match
 *      the format returns as-is, and a value with a tampered auth tag
 *      throws (we'd rather fail loudly than feed a forged token to
 *      Zernio).
 *
 *   3. encrypt requires a 64-hex-char TOKEN_ENCRYPTION_KEY. Anything
 *      else throws — silently downgrading to no-encryption would
 *      break the audit trail.
 *
 *   4. isEncrypted distinguishes the encrypted format from plaintext
 *      (used by decryptToken to decide whether to decrypt). A
 *      regression here either leaks plaintext through decrypt
 *      (throws) or misses encrypted values (returns ciphertext).
 */

const VALID_KEY = '0'.repeat(64);
const ANOTHER_VALID_KEY = '1'.repeat(64);

describe('encrypt / decrypt round-trip', () => {
  beforeEach(() => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', VALID_KEY);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('decrypts back to the original plaintext', () => {
    const ciphertext = encrypt('hello world');
    expect(decrypt(ciphertext)).toBe('hello world');
  });

  it('preserves unicode characters round-trip', () => {
    const ciphertext = encrypt('café — 你好 🚀');
    expect(decrypt(ciphertext)).toBe('café — 你好 🚀');
  });

  it('produces output in iv:ciphertext:authTag hex-segment format', () => {
    const out = encrypt('anything');
    const parts = out.split(':');
    expect(parts).toHaveLength(3);
    for (const p of parts) {
      expect(p).toMatch(/^[0-9a-f]+$/);
    }
    // IV: 12 bytes -> 24 hex; auth tag: 16 bytes -> 32 hex.
    expect(parts[0].length).toBe(24);
    expect(parts[2].length).toBe(32);
  });

  it('uses a random IV per call (same plaintext encrypts differently)', () => {
    const a = encrypt('same input');
    const b = encrypt('same input');
    expect(a).not.toBe(b);
    // But both decrypt to the same plaintext.
    expect(decrypt(a)).toBe('same input');
    expect(decrypt(b)).toBe('same input');
  });

  it('handles empty strings', () => {
    const ciphertext = encrypt('');
    expect(decrypt(ciphertext)).toBe('');
  });
});

describe('encrypt — key validation', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('throws when TOKEN_ENCRYPTION_KEY is missing', () => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', '');
    expect(() => encrypt('x')).toThrow(/TOKEN_ENCRYPTION_KEY env var is not set/);
  });

  it('throws when TOKEN_ENCRYPTION_KEY is the wrong length', () => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'abcd');
    expect(() => encrypt('x')).toThrow(/exactly 64 hex characters/);
  });

  it('throws when TOKEN_ENCRYPTION_KEY contains non-hex characters', () => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'z'.repeat(64));
    expect(() => encrypt('x')).toThrow(/64 hex characters/);
  });
});

describe('decrypt — backwards compat with plaintext tokens', () => {
  it('returns the value as-is when TOKEN_ENCRYPTION_KEY is unset (legacy plaintext path)', () => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', '');
    expect(decrypt('plain-old-token')).toBe('plain-old-token');
    vi.unstubAllEnvs();
  });

  it('returns a non-three-segment value as-is (not encrypted format)', () => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', VALID_KEY);
    expect(decrypt('not:encrypted')).toBe('not:encrypted');
    expect(decrypt('plain')).toBe('plain');
    vi.unstubAllEnvs();
  });

  it('returns a three-segment value with wrong IV/tag lengths as-is', () => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', VALID_KEY);
    // IV must be 12 bytes; this is shorter.
    const fake = 'aabb:ccdd:eeff';
    expect(decrypt(fake)).toBe(fake);
    vi.unstubAllEnvs();
  });
});

describe('decrypt — security properties', () => {
  beforeEach(() => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', VALID_KEY);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('throws when the auth tag has been tampered with (GCM authentication)', () => {
    const ciphertext = encrypt('sensitive token');
    const [iv, body, tag] = ciphertext.split(':');
    // Flip the last hex char of the auth tag.
    const flipped = tag.slice(0, -1) + (tag.slice(-1) === '0' ? '1' : '0');
    expect(() => decrypt(`${iv}:${body}:${flipped}`)).toThrow();
  });

  it('throws when the ciphertext has been tampered with', () => {
    const ciphertext = encrypt('sensitive token');
    const [iv, body, tag] = ciphertext.split(':');
    const flipped = body.slice(0, -1) + (body.slice(-1) === '0' ? '1' : '0');
    expect(() => decrypt(`${iv}:${flipped}:${tag}`)).toThrow();
  });

  it('throws when decrypting with a different key (defends against key confusion)', () => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', VALID_KEY);
    const ciphertext = encrypt('sensitive token');
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', ANOTHER_VALID_KEY);
    expect(() => decrypt(ciphertext)).toThrow();
  });
});

describe('isEncrypted', () => {
  it('returns true for a real encrypt() output', () => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', VALID_KEY);
    const ciphertext = encrypt('whatever');
    expect(isEncrypted(ciphertext)).toBe(true);
    vi.unstubAllEnvs();
  });

  it('returns true for a hand-rolled value with the right segment lengths', () => {
    const iv = crypto.randomBytes(12).toString('hex'); // 24 hex
    const body = 'abcd'; // arbitrary hex, length doesn't matter for isEncrypted
    const tag = '0'.repeat(32); // 32 hex
    expect(isEncrypted(`${iv}:${body}:${tag}`)).toBe(true);
  });

  it('returns false for plaintext (no colons)', () => {
    expect(isEncrypted('plain-token')).toBe(false);
  });

  it('returns false when there are not exactly 3 segments', () => {
    expect(isEncrypted('a:b')).toBe(false);
    expect(isEncrypted('a:b:c:d')).toBe(false);
  });

  it('returns false when any segment is non-hex', () => {
    const iv = '0'.repeat(24);
    const tag = '0'.repeat(32);
    expect(isEncrypted(`${iv}:zzzz:${tag}`)).toBe(false);
    expect(isEncrypted(`zzzzzzzzzzzzzzzzzzzzzzzz:abcd:${tag}`)).toBe(false);
  });

  it('returns false when IV is not 24 hex chars', () => {
    const tag = '0'.repeat(32);
    expect(isEncrypted(`${'0'.repeat(20)}:abcd:${tag}`)).toBe(false);
  });

  it('returns false when auth tag is not 32 hex chars', () => {
    const iv = '0'.repeat(24);
    expect(isEncrypted(`${iv}:abcd:${'0'.repeat(28)}`)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isEncrypted('')).toBe(false);
  });
});

describe('decryptToken', () => {
  beforeEach(() => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', VALID_KEY);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('decrypts an encrypted value', () => {
    const ciphertext = encrypt('secret');
    expect(decryptToken(ciphertext)).toBe('secret');
  });

  it('returns plaintext as-is (no decrypt attempt)', () => {
    expect(decryptToken('plain-token')).toBe('plain-token');
  });

  it('returns a near-format-but-not-encrypted value as-is', () => {
    // 3 segments, but IV is the wrong length — not our format.
    expect(decryptToken('aabb:ccdd:eeff')).toBe('aabb:ccdd:eeff');
  });
});
