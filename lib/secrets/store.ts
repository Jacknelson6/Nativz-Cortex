/**
 * Runtime secret resolver. `getSecret(key)` checks the encrypted app_secrets
 * override first and falls back to process.env — so existing deployments with
 * env-only secrets keep working, and editing a value in the UI takes effect
 * without a redeploy.
 *
 * Values are cached per-function-instance for 60s to avoid a DB round-trip on
 * every request (cron auth, webhook signature check, etc. hit this path
 * frequently). `invalidateSecretCache()` is called by the admin PUT/DELETE
 * routes so a freshly-saved secret is visible on the next read even from the
 * same Fluid Compute warm instance.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { decryptSecret, isEncryptionKeyConfigured } from './crypto';

const TTL_MS = 60_000;

type CacheEntry = {
  value: string | undefined;
  fetchedAt: number;
};

const cache = new Map<string, CacheEntry>();

/**
 * Keys that can be overridden via the UI. Listed explicitly so we can't be
 * tricked into looking up arbitrary env keys (e.g. an attacker injecting a
 * row for DATABASE_URL).
 *
 * CRON_SECRET is intentionally NOT in this list — rotating it cleanly would
 * require migrating every cron route (17+ files) to the async resolver. For
 * now cron stays env-only; a future follow-up can add a shared cron auth
 * helper and pull it in.
 */
export const OVERRIDABLE_KEYS = [
  'RESEND_API_KEY',
  'RESEND_WEBHOOK_SECRET',
  'RESEND_WEBHOOK_SECRET_NATIVZ',
  'RESEND_WEBHOOK_SECRET_ANDERSON',
] as const;

export type OverridableKey = (typeof OVERRIDABLE_KEYS)[number];

export function isOverridableKey(key: string): key is OverridableKey {
  return (OVERRIDABLE_KEYS as readonly string[]).includes(key);
}

export async function getSecret(key: OverridableKey): Promise<string | undefined> {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return cached.value;
  }

  const value = await resolveSecret(key);
  cache.set(key, { value, fetchedAt: Date.now() });
  return value;
}

async function resolveSecret(key: OverridableKey): Promise<string | undefined> {
  // DB override wins when the encryption key is configured AND a row exists.
  if (isEncryptionKeyConfigured()) {
    try {
      const admin = createAdminClient();
      const { data } = await admin
        .from('app_secrets')
        .select('ciphertext, iv, auth_tag')
        .eq('key', key)
        .maybeSingle();
      if (data) {
        const plaintext = decryptSecret({
          ciphertext: bufferFromMaybeHex(data.ciphertext),
          iv: bufferFromMaybeHex(data.iv),
          authTag: bufferFromMaybeHex(data.auth_tag),
        });
        return plaintext;
      }
    } catch (err) {
      // Decryption or DB failure falls through to the env var. Logged so the
      // Setup tab can't silently point at the wrong value forever.
      console.error('[secrets:resolveSecret] DB override read failed for', key, err);
    }
  }
  return process.env[key];
}

/**
 * Supabase returns bytea columns as hex-prefixed strings (`\\x…`) or base64
 * depending on the client version. This accepts either shape and also passes
 * through already-Buffer values (the MCP execute_sql path).
 */
function bufferFromMaybeHex(raw: unknown): Buffer {
  if (Buffer.isBuffer(raw)) return raw;
  if (typeof raw !== 'string') throw new Error('unexpected bytea shape');
  if (raw.startsWith('\\x')) return Buffer.from(raw.slice(2), 'hex');
  // Supabase JS v2 returns bytea as base64.
  return Buffer.from(raw, 'base64');
}

export function invalidateSecretCache(key?: OverridableKey): void {
  if (key) {
    cache.delete(key);
  } else {
    cache.clear();
  }
}

/**
 * Metadata-only view for the admin UI. Never exposes plaintext.
 */
export async function listSecretMetadata(): Promise<
  Array<{
    key: OverridableKey;
    envConfigured: boolean;
    source: 'db' | 'env' | 'missing';
    updatedBy: string | null;
    updatedAt: string | null;
  }>
> {
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from('app_secrets')
    .select('key, updated_by, updated_at, users:updated_by(email)')
    .in('key', OVERRIDABLE_KEYS as unknown as string[]);

  const byKey = new Map(
    (rows ?? []).map((r) => [r.key as OverridableKey, r] as const),
  );

  return OVERRIDABLE_KEYS.map((key) => {
    const envConfigured = Boolean(process.env[key]);
    const overrideRow = byKey.get(key);
    const source: 'db' | 'env' | 'missing' = overrideRow
      ? 'db'
      : envConfigured
      ? 'env'
      : 'missing';
    const updatedByEmail =
      (overrideRow?.users as { email?: string | null } | null | undefined)?.email ?? null;
    return {
      key,
      envConfigured,
      source,
      updatedBy: updatedByEmail,
      updatedAt: (overrideRow?.updated_at as string | null) ?? null,
    };
  });
}
