import { redirect } from 'next/navigation';
import { Boxes } from 'lucide-react';
import { getActiveBrand } from '@/lib/active-brand';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getBrandFromAgency } from '@/lib/agency/detect';
import { getDeliverableBalances } from '@/lib/deliverables/get-balances';
import { getRecentDeliverableActivity } from '@/lib/deliverables/get-recent-activity';
import { getDeliverablePipeline } from '@/lib/deliverables/get-pipeline';
import { inferScopeTier } from '@/lib/deliverables/scope';
import { listConfiguredAddons } from '@/lib/deliverables/addon-skus';
import { ProductionHero } from '@/components/deliverables/production-hero';
import { ScopePanel } from '@/components/deliverables/scope-panel';
import { PipelineView } from '@/components/deliverables/pipeline-view';
import { RecentActivity } from '@/components/deliverables/recent-activity';
import { AddOnSection } from '@/components/deliverables/add-on-section';
import { AdminShell } from '@/components/deliverables/admin-shell';
import type { CreditTransactionRow } from '@/lib/credits/types';

export const dynamic = 'force-dynamic';

const TX_LIMIT = 50;
const ACTIVITY_LIMIT = 30;

/**
 * Brand-root /deliverables page (replaces /credits).
 *
 * The single URL serves both audiences with a shared hero + scope panel,
 * then branches:
 *
 *   - admin  → ProductionHero + ScopePanel + AdminShell (per-type tabs,
 *              allowance + manual grant + pause/resume + ledger).
 *   - viewer → ProductionHero + ScopePanel + RecentActivity + AddOnSection.
 *
 * Data fetching: balances, transactions, recent-activity entries, and the
 * client row (for agency lookup) all run in one Promise.all so the page
 * stays single-roundtrip.
 *
 * Copy on this page is the canonical client-facing surface for the
 * directional pivot — every string a client reads either lives here or
 * routes through `lib/deliverables/copy.ts`.
 */
export default async function DeliverablesPage() {
  const active = await getActiveBrand().catch(() => null);

  if (!active?.brand) {
    return (
      <div className="cortex-page-gutter mx-auto max-w-6xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-text-primary">Deliverables</h1>
        </header>
        <div className="rounded-xl border border-nativz-border bg-surface p-12 text-center">
          <Boxes className="mx-auto mb-3 h-8 w-8 text-text-tertiary" />
          <p className="text-sm text-text-secondary">
            Pick a brand from the top bar to see this month's production scope.
          </p>
        </div>
      </div>
    );
  }

  // Defence in depth: re-verify access for viewers (cookie tampering can't
  // widen scope this way). Admins are pre-authorized in `getActiveBrand`.
  if (!active.isAdmin) {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect('/login');
    const adminCheck = createAdminClient();
    const { data: access } = await adminCheck
      .from('user_client_access')
      .select('client_id')
      .eq('user_id', user.id)
      .eq('client_id', active.brand.id)
      .maybeSingle();
    if (!access) redirect('/');
  }

  const admin = createAdminClient();
  const clientId = active.brand.id;

  const [balances, activity, pipeline, txResult, clientResult] = await Promise.all([
    getDeliverableBalances(admin, clientId),
    getRecentDeliverableActivity(admin, clientId, { limit: ACTIVITY_LIMIT }),
    getDeliverablePipeline(admin, clientId),
    admin
      .from('credit_transactions')
      .select(
        'id, client_id, deliverable_type_id, kind, delta, charge_unit_kind, charge_unit_id, scheduled_post_id, refund_for_id, share_link_id, reviewer_email, stripe_payment_intent, actor_user_id, note, idempotency_key, created_at',
      )
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(TX_LIMIT)
      .returns<CreditTransactionRow[]>(),
    admin.from('clients').select('agency').eq('id', clientId).maybeSingle<{
      agency: string | null;
    }>(),
  ]);

  const txRows = txResult.data ?? [];
  const tier = inferScopeTier(balances);
  const agency = getBrandFromAgency(clientResult.data?.agency ?? null);
  const addons = listConfiguredAddons(agency);

  // Hydrate the editor index for pipeline cards in a single round-trip so
  // attribution avatars render without a client-side fetch.
  const editorIds = Array.from(
    new Set(
      pipeline.cards
        .map((c) => c.editorUserId)
        .filter((v): v is string => !!v),
    ),
  );
  let editorIndex = new Map<string, { name: string; avatarUrl: string | null }>();
  if (editorIds.length > 0) {
    const { data: members } = await admin
      .from('team_members')
      .select('user_id, full_name, avatar_url')
      .in('user_id', editorIds)
      .returns<Array<{ user_id: string; full_name: string | null; avatar_url: string | null }>>();
    editorIndex = new Map(
      (members ?? []).map((m) => [
        m.user_id,
        { name: m.full_name ?? 'Editor', avatarUrl: m.avatar_url },
      ]),
    );
  }

  return (
    <div className="cortex-page-gutter mx-auto max-w-6xl space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-text/80">
          {active.isAdmin ? 'Cortex · admin · deliverables' : 'Cortex · deliverables'}
        </p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-2xl font-semibold text-text-primary">
            {active.brand.name} deliverables
          </h1>
        </div>
        {!active.isAdmin ? (
          <p className="max-w-prose text-sm text-text-secondary">
            This is your monthly production scope. Each approved post draws from the matching
            type, edited videos, UGC, or graphics, until the next reset. If you need more before
            then, grab an add-on below.
          </p>
        ) : null}
      </header>

      <ProductionHero
        brandName={active.brand.name}
        tierLabel={tier.label}
        tierBlurb={tier.blurb}
        balances={balances}
      />

      <ScopePanel tier={tier} balances={balances} />

      <PipelineView snapshot={pipeline} editorIndex={editorIndex} />

      {active.isAdmin ? (
        <AdminShell clientId={clientId} balances={balances} transactions={txRows} />
      ) : (
        <>
          <RecentActivity entries={activity} brandName={active.brand.name} />
          <AddOnSection
            clientId={clientId}
            brandName={active.brand.name}
            addons={addons}
          />
        </>
      )}
    </div>
  );
}
