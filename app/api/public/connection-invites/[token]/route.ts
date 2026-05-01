import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBrandFromAgency } from '@/lib/agency/detect';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/public/connection-invites/[token]
 *
 * Powers the public `/connect/invite/{token}` page. Returns the brand,
 * the requested platforms, and the live status of each (connected vs
 * still-needed) so the page can render check marks for ones the client
 * already finished. Stamps `last_opened_at` on first open. 404s on
 * unknown / expired tokens.
 *
 * No auth.
 */

type PlatformKey =
  | 'tiktok'
  | 'instagram'
  | 'facebook'
  | 'youtube'
  | 'linkedin'
  | 'googlebusiness'
  | 'pinterest'
  | 'x'
  | 'threads'
  | 'bluesky';

const LABEL: Record<PlatformKey, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  googlebusiness: 'Google Business',
  pinterest: 'Pinterest',
  x: 'X (Twitter)',
  threads: 'Threads',
  bluesky: 'Bluesky',
};

interface InviteResponse {
  brandName: string;
  brandSlug: string | null;
  brand: 'nativz' | 'anderson';
  expired: boolean;
  completedAt: string | null;
  platforms: Array<{
    key: PlatformKey;
    label: string;
    status: 'connected' | 'pending';
    username: string | null;
  }>;
}

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  if (!token || token.length > 64) {
    return NextResponse.json({ error: 'invalid token' }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: invite } = await admin
    .from('connection_invites')
    .select(
      'id, client_id, platforms, completed_platforms, expires_at, last_opened_at, completed_at',
    )
    .eq('token', token)
    .maybeSingle();
  if (!invite) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  if (
    invite.expires_at &&
    new Date(invite.expires_at as string).getTime() < Date.now()
  ) {
    return NextResponse.json(
      {
        error: 'expired',
        message: 'This invite has expired. Ask the team to send a new one.',
      },
      { status: 410 },
    );
  }

  const [{ data: clientRow }, { data: profiles }] = await Promise.all([
    admin
      .from('clients')
      .select('id, name, slug, agency')
      .eq('id', invite.client_id)
      .maybeSingle(),
    admin
      .from('social_profiles')
      .select('platform, username, late_account_id, is_active, disconnect_alerted_at')
      .eq('client_id', invite.client_id),
  ]);

  if (!clientRow) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  if (!invite.last_opened_at) {
    void admin
      .from('connection_invites')
      .update({ last_opened_at: new Date().toISOString() })
      .eq('id', invite.id)
      .then(
        () => undefined,
        () => undefined,
      );
  }

  const askedFor = (invite.platforms as PlatformKey[]) ?? [];
  const completed = new Set<string>(
    (invite.completed_platforms as string[]) ?? [],
  );

  const profilesByPlatform = new Map<string, { username: string | null; connected: boolean }>();
  for (const p of profiles ?? []) {
    const isConnected =
      !!p.late_account_id &&
      p.is_active !== false &&
      !p.disconnect_alerted_at;
    const existing = profilesByPlatform.get(p.platform as string);
    if (!existing || (isConnected && !existing.connected)) {
      profilesByPlatform.set(p.platform as string, {
        username: (p.username as string | null) ?? null,
        connected: isConnected,
      });
    }
  }

  const platforms = askedFor.map((key) => {
    const profile = profilesByPlatform.get(key);
    const isComplete = completed.has(key) || !!profile?.connected;
    return {
      key,
      label: LABEL[key] ?? key,
      status: isComplete ? ('connected' as const) : ('pending' as const),
      username: profile?.username ?? null,
    };
  });

  const brand = getBrandFromAgency(clientRow.agency as string | null);

  const body: InviteResponse = {
    brandName: clientRow.name as string,
    brandSlug: (clientRow.slug as string | null) ?? null,
    brand,
    expired: false,
    completedAt: (invite.completed_at as string | null) ?? null,
    platforms,
  };
  return NextResponse.json(body);
}
