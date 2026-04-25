import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { SectionHeader } from '@/components/admin/section-tabs';
import { RefreshButton } from '@/components/admin/shared/refresh-button';
import { SalesPipelineRoster } from '@/components/sales/sales-pipeline-roster';
import { StartSalesFlow } from '@/components/sales/start-sales-flow';
import {
  countByPrimaryStatus,
  getSalesPipelineRows,
} from '@/lib/sales/pipeline';
import { refreshOnboarding } from '../onboarding/actions';

export const dynamic = 'force-dynamic';

/**
 * /admin/sales — unified pipeline. Replaces the standalone
 * /admin/proposals roster and /admin/onboarding roster — the same row
 * is both "this brand has a proposal sent" AND "this brand is in
 * onboarding", since they're two views of one relationship.
 *
 * Spec: docs/superpowers/specs/2026-04-25-sales-pipeline-unification.md
 *
 * Rows can be filtered by primary status (Sent / Viewed / Signed /
 * Awaiting payment / Paid / Onboarding / Active / Archived). Click a row
 * to jump into either the proposal editor or the flow detail page —
 * both surfaces still exist as deep links; this page just lifts the
 * shared mental model into one roster.
 *
 * Headline metric strip shows pipeline counts so the admin can see at a
 * glance what's waiting on what.
 */
export default async function SalesPipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; tab?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  const isAdmin = me?.is_super_admin === true || me?.role === 'admin' || me?.role === 'super_admin';
  if (!isAdmin) redirect('/admin/dashboard');

  const [rows, clientsRes] = await Promise.all([
    getSalesPipelineRows({ admin }),
    admin
      .from('clients')
      .select('id, name, slug, logo_url, agency')
      .eq('hide_from_roster', false)
      .order('name', { ascending: true }),
  ]);

  const counts = countByPrimaryStatus(rows);

  // Live-flow set drives the existing-client option dimming in the picker.
  const liveFlowClientIds = new Set(
    rows
      .filter((r) => r.flow && r.flow.status !== 'archived' && r.flow.status !== 'completed')
      .map((r) => r.client.id),
  );
  const clientOptions = ((clientsRes.data ?? []) as Array<{
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    agency: string | null;
  }>).map((c) => ({
    ...c,
    has_live_flow: liveFlowClientIds.has(c.id),
  }));

  const initialStatus = sp.status ?? 'all';

  return (
    <div className="cortex-page-gutter max-w-6xl mx-auto space-y-6">
      <SectionHeader
        title="Sales pipeline"
        description="Every prospect's proposal + onboarding state in one place. Start a new flow from an existing client or welcome a fresh prospect."
        action={
          <div className="flex items-center gap-2">
            <RefreshButton action={refreshOnboarding} />
            <StartSalesFlow clients={clientOptions} />
          </div>
        }
      />

      <SalesPipelineRoster rows={rows} counts={counts} initialStatus={initialStatus} />
    </div>
  );
}
