/**
 * Token encryption helpers for OAuth tokens stored in the database.
 *
 * Uses AES-256-GCM with a random IV per encryption call.
 * Encrypted values are stored as `iv:ciphertext:authTag` (hex-encoded).
 *
 * Requires env var: TOKEN_ENCRYPTION_KEY (32-byte hex string, i.e. 64 hex chars).
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits — recommended for GCM

/**
 * Validate and return the encryption key from the environment.
 * Throws if the key is missing or not exactly 32 bytes (64 hex chars).
 */
function getEncryptionKey(): Buffer {
  const keyHex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY env var is not set. ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }

  if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). ' +
        `Got ${keyHex.length} characters.`,
    );
  }

  return Buffer.from(keyHex, 'hex');
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns `iv:ciphertext:authTag` as hex-encoded segments.
 *
 * @throws if TOKEN_ENCRYPTION_KEY is not set or invalid.
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${encrypted.toString('hex')}:${authTag.toString('hex')}`;
}

/**
 * Decrypt a value produced by `encrypt()`.
 *
 * If TOKEN_ENCRYPTION_KEY is not set, returns the value as-is for backward
 * compatibility with existing plaintext tokens during migration.
 */
export function decrypt(encrypted: string): string {
  // If the key is not set, return as-is (backward compat with plaintext tokens)
  if (!process.env.TOKEN_ENCRYPTION_KEY) {
    return encrypted;
  }

  const key = getEncryptionKey();
  const parts = encrypted.split(':');

  if (parts.length !== 3) {
    // Not in encrypted format — return as-is (plaintext token from before migration)
    return encrypted;
  }

  const [ivHex, ciphertextHex, authTagHex] = parts;

  const iv = Buffer.from(ivHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  // Validate lengths to avoid passing garbage to the decipher
  if (iv.length !== IV_LENGTH || authTag.length !== 16) {
    // Doesn't look like our encrypted format — return as-is
    return encrypted;
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

/**
 * Returns true if the value matches the encrypted format: three colon-separated
 * hex segments (iv:ciphertext:authTag).
 */
export function isEncrypted(value: string): boolean {
  const parts = value.split(':');
  if (parts.length !== 3) return false;

  const [ivHex, ciphertextHex, authTagHex] = parts;

  // Each segment must be non-empty hex
  const hexPattern = /^[0-9a-fA-F]+$/;
  if (!hexPattern.test(ivHex) || !hexPattern.test(ciphertextHex) || !hexPattern.test(authTagHex)) {
    return false;
  }

  // IV should be 12 bytes (24 hex chars), auth tag should be 16 bytes (32 hex chars)
  if (ivHex.length !== IV_LENGTH * 2 || authTagHex.length !== 32) {
    return false;
  }

  return true;
}

/**
 * Decrypt a token value only if it appears to be encrypted.
 * Safe to call on both plaintext and encrypted values.
 */
export function decryptToken(value: string): string {
  if (isEncrypted(value)) {
    return decrypt(value);
  }
  return value;
}
