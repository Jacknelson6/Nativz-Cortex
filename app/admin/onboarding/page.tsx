import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { SectionHeader } from '@/components/admin/section-tabs';
import { RefreshButton } from '@/components/admin/shared/refresh-button';
import { OnboardingFlowsRoster } from '@/components/onboarding/onboarding-flows-roster';
import { refreshOnboarding } from './actions';

export const dynamic = 'force-dynamic';

/**
 * /admin/onboarding — flow roster. Each flow is a per-client onboarding
 * pipeline made of segments (Agreement & Payment is always first; Social
 * etc. attach as additional segments). Click a row to open the flow
 * builder/timeline.
 */
export default async function OnboardingRosterPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  if (me?.role !== 'admin' && !me?.is_super_admin) notFound();

  const { data: flowsRaw } = await admin
    .from('onboarding_flows')
    .select(
      'id, status, proposal_id, share_token, started_at, completed_at, created_at, ' +
      'clients!inner(id, name, slug, logo_url, agency)',
    )
    .order('created_at', { ascending: false });

  type FlowRow = {
    id: string;
    status: 'needs_proposal' | 'awaiting_payment' | 'active' | 'paused' | 'completed' | 'archived';
    proposal_id: string | null;
    share_token: string;
    started_at: string | null;
    completed_at: string | null;
    created_at: string;
    clients:
      | { id: string; name: string; slug: string; logo_url: string | null; agency: string | null }
      | Array<{ id: string; name: string; slug: string; logo_url: string | null; agency: string | null }>;
  };

  const flows = ((flowsRaw as FlowRow[] | null) ?? []).map((f) => ({
    ...f,
    clients: Array.isArray(f.clients) ? f.clients[0] ?? null : f.clients,
  }));

  return (
    <div className="cortex-page-gutter max-w-6xl mx-auto space-y-8">
      <SectionHeader
        title="Onboarding"
        description="One flow per client — segments unlock as the agreement is signed and paid. Click a row to build or track."
        action={<RefreshButton action={refreshOnboarding} />}
      />

      <OnboardingFlowsRoster flows={flows} />
    </div>
  );
}
