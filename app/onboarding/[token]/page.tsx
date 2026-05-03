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
import { OnboardingStepper } from './stepper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    .select('id, name, agency, logo_url')
    .eq('id', row.client_id)
    .single<{ id: string; name: string | null; agency: string | null; logo_url: string | null }>();

  if (!clientRow) notFound();

  const agency = getBrandFromAgency(clientRow.agency);
  const screens = SCREENS[row.kind];

  return (
    <div className="min-h-screen bg-background text-text-primary">
      <OnboardingStepper
        token={token}
        agency={agency}
        clientName={clientRow.name ?? 'your brand'}
        clientLogoUrl={clientRow.logo_url}
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
