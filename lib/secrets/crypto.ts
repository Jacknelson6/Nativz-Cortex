/**
 * AES-256-GCM envelope for app_secrets.
 *
 * SECRETS_ENCRYPTION_KEY holds the 32-byte master key as a 64-char hex string.
 * Set once in Vercel env, never written to the DB — rotating it would orphan
 * every existing row, so treat it as permanent unless you also re-encrypt.
 *
 * Ciphertext is stored alongside its IV + auth tag; GCM rejects any tampering
 * at decrypt time so we don't need HMAC on top.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // GCM standard
const KEY_BYTES = 32;

function getKey(): Buffer {
  const raw = process.env.SECRETS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'SECRETS_ENCRYPTION_KEY not set — cannot read or write encrypted secrets',
    );
  }
  const buf = Buffer.from(raw, 'hex');
  if (buf.length !== KEY_BYTES) {
    throw new Error(
      `SECRETS_ENCRYPTION_KEY must be ${KEY_BYTES * 2} hex chars (${KEY_BYTES} bytes); got ${buf.length} bytes`,
    );
  }
  return buf;
}

export function isEncryptionKeyConfigured(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plaintext: string): {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
} {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext, iv, authTag };
}

export function decryptSecret({
  ciphertext,
  iv,
  authTag,
}: {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
}): string {
  const key = getKey();
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}
