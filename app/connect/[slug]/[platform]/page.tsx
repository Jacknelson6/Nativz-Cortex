import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { ConnectLanding } from './connect-landing';

export const dynamic = 'force-dynamic';

const SUPPORTED = ['tiktok', 'instagram', 'facebook', 'youtube'] as const;
type SupportedPlatform = (typeof SUPPORTED)[number];

const PLATFORM_LABEL: Record<SupportedPlatform, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
  youtube: 'YouTube',
};

/**
 * Public, no-auth Zernio kickoff for a single platform.
 *
 * Flow: agency copies the URL out of the Connections matrix modal,
 * sends it to the client (Slack, email, text). Client clicks, lands on
 * a one-button page, taps "Connect", we mint a fresh Zernio auth URL on
 * the server, and `window.location` swaps them onto the platform's
 * hosted consent screen. After they approve, Zernio redirects back to
 * `/api/scheduler/connect/callback` and the existing pipeline writes
 * the row into `social_profiles`.
 *
 * The slug is the public identifier. We don't mint share_tokens because
 * (a) the existing slug is already on the URL elsewhere and (b) any
 * agency operator who can see the matrix can already see the slug, so
 * the security profile is identical.
 */
export default async function PublicConnectPage({
  params,
}: {
  params: Promise<{ slug: string; platform: string }>;
}) {
  const { slug, platform } = await params;

  if (!SUPPORTED.includes(platform as SupportedPlatform)) notFound();
  const platformKey = platform as SupportedPlatform;

  const admin = createAdminClient();
  const { data: client } = await admin
    .from('clients')
    .select('id, name, slug, logo_url')
    .eq('slug', slug)
    .maybeSingle();

  if (!client) notFound();

  return (
    <ConnectLanding
      slug={slug}
      platform={platformKey}
      platformLabel={PLATFORM_LABEL[platformKey]}
      clientName={client.name}
      clientLogoUrl={client.logo_url ?? null}
    />
  );
}
