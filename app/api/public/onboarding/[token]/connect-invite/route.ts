/**
 * /api/public/onboarding/[token]/connect-invite
 *
 * Client-triggered: from the social_connect screen, mint a single-platform
 * connection invite for the brand and return its public URL. The screen
 * opens that URL in a popup so the client can complete the Zernio OAuth
 * dance without leaving the onboarding flow. We deliberately skip the
 * email side since the client is already logged into the platform-side
 * accounts in the same browser.
 *
 * POST { platform: string }
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getOnboardingByToken } from '@/lib/onboarding/api';
import { getBrandFromAgency } from '@/lib/agency/detect';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPPORTED_PLATFORMS = [
  'tiktok',
  'instagram',
  'facebook',
  'youtube',
  'linkedin',
  'googlebusiness',
  'pinterest',
  'x',
  'threads',
  'bluesky',
] as const;

const InputSchema = z.object({
  platform: z.enum(SUPPORTED_PLATFORMS),
});

const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function mintToken(length = 32): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length];
  }
  return out;
}

function inviteUrl(brand: 'nativz' | 'anderson', token: string): string {
  const host =
    brand === 'anderson'
      ? process.env.PROPOSALS_PUBLIC_HOST_ANDERSON ??
        'https://cortex.andersoncollaborative.com'
      : process.env.PROPOSALS_PUBLIC_HOST_NATIVZ ??
        'https://cortex.nativz.io';
  return `${host.replace(/\/+$/, '')}/s/${token}`;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const row = await getOnboardingByToken(token);
  if (!row || row.status === 'abandoned') {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  if (row.kind !== 'smm') {
    return NextResponse.json({ error: 'connect is SMM-only' }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid input', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: clientRow } = await admin
    .from('clients')
    .select('id, agency')
    .eq('id', row.client_id)
    .single<{ id: string; agency: string | null }>();
  if (!clientRow) {
    return NextResponse.json({ error: 'client missing' }, { status: 404 });
  }

  const brand = getBrandFromAgency(clientRow.agency);
  const inviteToken = mintToken(32);
  const { data: inserted, error: insertErr } = await admin
    .from('connection_invites')
    .insert({
      client_id: clientRow.id,
      token: inviteToken,
      platforms: [parsed.data.platform],
      recipient_emails: [],
      notify_chat: false,
      notify_email: false,
      mode: 'connect',
      created_by: null,
    })
    .select('id, token')
    .single();
  if (insertErr || !inserted) {
    return NextResponse.json(
      { error: 'db_error', detail: insertErr?.message ?? 'insert failed' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    token: inserted.token,
    url: inviteUrl(brand, inserted.token),
  });
}
