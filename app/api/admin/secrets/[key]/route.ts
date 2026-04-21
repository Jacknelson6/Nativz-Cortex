/**
 * PUT    /api/admin/secrets/[key] — set or replace the DB override for `key`.
 * DELETE /api/admin/secrets/[key] — remove the DB override so env takes over.
 *
 * Plaintext values are accepted only on PUT and are never returned anywhere.
 * The row stores AES-256-GCM ciphertext; decrypting requires SECRETS_ENCRYPTION_KEY.
 *
 * Request body shape for PUT: `{ "value": "<plaintext>" }`. Empty strings are
 * rejected — use DELETE to clear an override.
 *
 * @auth Admin / super_admin only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { encryptSecret, isEncryptionKeyConfigured } from '@/lib/secrets/crypto';
import { invalidateSecretCache, isOverridableKey } from '@/lib/secrets/store';

export const maxDuration = 10;

const putSchema = z.object({
  value: z.string().min(1).max(4096),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { key } = await params;

  if (!isOverridableKey(key)) {
    return NextResponse.json({ error: 'Key is not in the overridable list' }, { status: 400 });
  }

  if (!isEncryptionKeyConfigured()) {
    return NextResponse.json(
      {
        error:
          'SECRETS_ENCRYPTION_KEY is not set in the server env. Add it and redeploy before managing secret overrides.',
      },
      { status: 503 },
    );
  }

  const raw = await request.json().catch(() => ({}));
  const parsed = putSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { ciphertext, iv, authTag } = encryptSecret(parsed.data.value);

  const admin = createAdminClient();
  const { error } = await admin.from('app_secrets').upsert(
    {
      key,
      ciphertext,
      iv,
      auth_tag: authTag,
      updated_by: auth.user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  );

  if (error) {
    console.error('[secrets:put] upsert failed:', error);
    return NextResponse.json({ error: 'Failed to save secret' }, { status: 500 });
  }

  invalidateSecretCache(key);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { key } = await params;

  if (!isOverridableKey(key)) {
    return NextResponse.json({ error: 'Key is not in the overridable list' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from('app_secrets').delete().eq('key', key);

  if (error) {
    console.error('[secrets:delete] failed:', error);
    return NextResponse.json({ error: 'Failed to clear secret override' }, { status: 500 });
  }

  invalidateSecretCache(key);
  return NextResponse.json({ ok: true });
}
