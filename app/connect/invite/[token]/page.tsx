import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBrandFromAgency } from '@/lib/agency/detect';
import { InviteLanding } from './invite-landing';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Public landing for a self-serve connection invite.
 *
 * The token is HMAC-free here — it's a high-entropy random string
 * (32 chars, ~190 bits) and the row is the only place it exists, so
 * presence in the table = valid. Expiry is checked server-side.
 *
 * The page is intentionally lean: brand logo, list of platforms the
 * admin asked for, one Connect button per row. Pulls live status so
 * a refresh after Zernio bounce-back shows the green check on the
 * platform that just finished.
 */
export default async function ConnectInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!token || token.length > 64) notFound();

  const admin = createAdminClient();
  const { data: invite } = await admin
    .from('connection_invites')
    .select(
      'id, client_id, platforms, completed_platforms, expires_at, completed_at',
    )
    .eq('token', token)
    .maybeSingle();
  if (!invite) notFound();

  const expired =
    !!invite.expires_at &&
    new Date(invite.expires_at as string).getTime() < Date.now();

  const { data: client } = await admin
    .from('clients')
    .select('id, name, slug, agency, logo_url')
    .eq('id', invite.client_id)
    .maybeSingle();
  if (!client) notFound();

  const brand = getBrandFromAgency((client.agency as string | null) ?? null);

  return (
    <InviteLanding
      token={token}
      brand={brand}
      brandName={client.name as string}
      brandLogoUrl={(client.logo_url as string | null) ?? null}
      platforms={(invite.platforms as string[]) ?? []}
      completedAt={(invite.completed_at as string | null) ?? null}
      expired={expired}
    />
  );
}
