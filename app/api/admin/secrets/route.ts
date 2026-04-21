/**
 * GET /api/admin/secrets
 *   Returns metadata for every overridable secret key — envConfigured flag,
 *   current source ('db' | 'env' | 'missing'), updated_by email, updated_at.
 *   NEVER returns the plaintext value. Reading a secret back out is not a
 *   supported operation; admins can only overwrite or clear.
 *
 * @auth Admin / super_admin only.
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api/require-admin';
import { listSecretMetadata } from '@/lib/secrets/store';
import { isEncryptionKeyConfigured } from '@/lib/secrets/crypto';

export const maxDuration = 10;

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const encryptionReady = isEncryptionKeyConfigured();
  if (!encryptionReady) {
    // Without SECRETS_ENCRYPTION_KEY we can still report env-backed values,
    // but the UI should disable the edit affordance with a clear message.
    return NextResponse.json({
      encryptionReady: false,
      secrets: (
        await import('@/lib/secrets/store')
      ).OVERRIDABLE_KEYS.map((key) => ({
        key,
        envConfigured: Boolean(process.env[key]),
        source: process.env[key] ? ('env' as const) : ('missing' as const),
        updatedBy: null,
        updatedAt: null,
      })),
    });
  }

  const secrets = await listSecretMetadata();
  return NextResponse.json({ encryptionReady: true, secrets });
}
