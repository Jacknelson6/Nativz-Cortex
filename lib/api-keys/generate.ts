import { randomBytes, createHash } from 'crypto';

const KEY_PREFIX = 'ntvz_';

export function generateApiKey(): { plaintext: string; hash: string; prefix: string } {
  const raw = randomBytes(20).toString('hex'); // 40 hex chars
  const plaintext = `${KEY_PREFIX}${raw}`;
  const hash = createHash('sha256').update(plaintext).digest('hex');
  const prefix = plaintext.slice(0, 20); // "ntvz_" + first 12 hex
  return { plaintext, hash, prefix };
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}
