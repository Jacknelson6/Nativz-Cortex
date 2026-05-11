/**
 * /onboarding/[token]
 *
 * Public, share-token-gated stepper. Anyone with the URL can advance the
 * flow: the token IS the auth. We do a server-side fetch of the row +
 * client to render an initial paint with no flicker, then hand off to a
 * client component that owns navigation, form state, and the PATCH calls
 * back to /api/public/onboarding/[token].
 *
 * Brand mode is forced by the root layout based on the request hostname,
 * so we don't need to wrap in a BrandModeProvider here.
 */

import { notFound } from 'next/navigation';
import { getOnboardingByToken } from '@/lib/onboarding/api';
import { SCREENS } from '@/lib/onboarding/screens';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBrandFromAgency } from '@/lib/agency/detect';
import { getTheme } from '@/lib/branding';
import { OnboardingStepper } from './stepper';
import type { BrandBasicsPrefill } from '@/components/onboarding/screens/brand-basics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ClientRow {
  id: string;
  name: string | null;
  agency: string | null;
  logo_url: string | null;
  website_url: string | null;
  tagline: string | null;
  products: string | null;
  target_audience: string | null;
  brand_voice: string | null;
  current_offers: string | null;
}

export default async function OnboardingClientPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!token) notFound();

  const row = await getOnboardingByToken(token);
  if (!row) notFound();
  if (row.status === 'abandoned') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
        <div className="max-w-md space-y-2">
          <h1 className="text-xl font-semibold text-text-primary">
            This onboarding link has been cancelled
          </h1>
          <p className="text-sm text-text-secondary">
            Reach out to your account manager if this looks wrong.
          </p>
        </div>
      </div>
    );
  }

  const admin = createAdminClient();
  const { data: clientRow } = await admin
    .from('clients')
    .select(
      'id, name, agency, logo_url, website_url, tagline, products, target_audience, brand_voice, current_offers',
    )
    .eq('id', row.client_id)
    .single<ClientRow>();

  if (!clientRow) notFound();

  const agency = getBrandFromAgency(clientRow.agency);
  const theme = getTheme(agency);
  const screens = SCREENS[row.kind];

  const prefill: BrandBasicsPrefill = {
    tagline: clientRow.tagline,
    what_we_sell: clientRow.products,
    audience: clientRow.target_audience,
    voice: clientRow.brand_voice,
    current_offers: clientRow.current_offers,
    website_url: clientRow.website_url,
    logo_url: clientRow.logo_url,
  };

  return (
    <div className="min-h-screen bg-background text-text-primary">
      <OnboardingStepper
        token={token}
        agency={agency}
        theme={theme}
        clientName={clientRow.name ?? 'your brand'}
        clientLogoUrl={clientRow.logo_url}
        brandPrefill={prefill}
        initial={{
          kind: row.kind,
          platforms: row.platforms,
          current_step: row.current_step,
          status: row.status,
          step_state: row.step_state,
          completed_at: row.completed_at,
        }}
        screens={screens}
      />
    </div>
  );
}
