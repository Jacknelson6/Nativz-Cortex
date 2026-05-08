/**
 * /api/public/onboarding/[token]/logo
 *
 * Public, share-token-gated logo upload. Mirrors the admin endpoint
 * `/api/clients/upload-logo` but auths via the onboarding share_token
 * instead of an admin session, then writes the resulting public URL
 * back onto the token's `clients` row + into the onboarding's
 * `step_state.brand_basics.logo_url` so the prefill stays in sync.
 *
 * Accepts JPEG, PNG, or WebP up to 2 MB. Returns the public URL.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getOnboardingByToken } from '@/lib/onboarding/api';
import { validateFileSignature } from '@/lib/security/validate-file-type';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 2 * 1024 * 1024;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: 'missing token' }, { status: 400 });

  try {
    const row = await getOnboardingByToken(token);
    if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
    if (row.status === 'abandoned') {
      return NextResponse.json({ error: 'cancelled' }, { status: 410 });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Use JPEG, PNG, or WebP.' },
        { status: 400 },
      );
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 2 MB.' },
        { status: 400 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const { valid, detectedType } = validateFileSignature(arrayBuffer, ALLOWED_TYPES);
    if (!valid) {
      return NextResponse.json(
        {
          error: `File content does not match an allowed image type. Detected: ${
            detectedType ?? 'unknown'
          }`,
        },
        { status: 400 },
      );
    }

    const ext = file.name.split('.').pop() || 'png';
    const filename = `${row.client_id}/${crypto.randomUUID()}.${ext}`;
    const buffer = Buffer.from(arrayBuffer);

    const admin = createAdminClient();
    const { error: uploadError } = await admin.storage
      .from('client-logos')
      .upload(filename, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('[onboarding/logo] upload error:', uploadError);
      return NextResponse.json({ error: 'Upload failed. Try again.' }, { status: 500 });
    }

    const { data: publicUrl } = admin.storage.from('client-logos').getPublicUrl(filename);
    const url = publicUrl.publicUrl;

    // Mirror onto the clients row immediately so admin views see it.
    await admin.from('clients').update({ logo_url: url }).eq('id', row.client_id);

    return NextResponse.json({ url });
  } catch (err) {
    console.error('[onboarding/logo] error:', err);
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
