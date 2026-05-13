import { notFound } from 'next/navigation';
import { Boxes } from 'lucide-react';
import { getActiveBrand } from '@/lib/active-brand';
import { createAdminClient } from '@/lib/supabase/admin';
import { getDeliverableBalances } from '@/lib/deliverables/get-balances';
import { getDeliverablePipeline } from '@/lib/deliverables/get-pipeline';
import { inferScopeTier } from '@/lib/deliverables/scope';
import { getActiveTier } from '@/lib/deliverables/get-active-tier';
import { ProductionHero } from '@/components/deliverables/production-hero';
import { ScopePanel } from '@/components/deliverables/scope-panel';
import { TierCard } from '@/components/deliverables/tier-card';
import { PipelineView } from '@/components/deliverables/pipeline-view';
import { AdminShell } from '@/components/deliverables/admin-shell';
import type { CreditTransactionRow } from '@/lib/credits/types';

export const dynamic = 'force-dynamic';

const TX_LIMIT = 50;

/**
 * Brand-root /deliverables — admin-only.
 *
 * The deliverables ledger is internal accounting; the client-facing surface
 * is the share link. Viewers hit notFound(); admins keep the full
 * ProductionHero + ScopePanel + Pipeline + AdminShell view.
 */
export default async function DeliverablesPage() {
  const active = await getActiveBrand().catch(() => null);

  if (!active?.isAdmin) notFound();

  if (!active.brand) {
    return (
      <div className="cortex-page-gutter mx-auto max-w-6xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-text-primary">Deliverables</h1>
        </header>
        <div className="rounded-xl border border-nativz-border bg-surface p-12 text-center">
          <Boxes className="mx-auto mb-3 h-8 w-8 text-text-tertiary" />
          <p className="text-sm text-text-secondary">
            Pick a brand from the top bar to see this month&apos;s production scope.
          </p>
        </div>
      </div>
    );
  }

  const admin = createAdminClient();
  const clientId = active.brand.id;

  const [balances, pipeline, txResult, activeTier] = await Promise.all([
    getDeliverableBalances(admin, clientId),
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
    getActiveTier(admin, clientId),
  ]);

  const txRows = txResult.data ?? [];
  const tier = inferScopeTier(balances);

  if (activeTier.mixedTiers) {
    console.warn(
      `[deliverables] client ${clientId} has balance rows referencing multiple package_tier_ids; rendering most-common tier. Re-run the tier picker to straighten this out.`,
    );
  }

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
          Cortex · admin · deliverables
        </p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-2xl font-semibold text-text-primary">
            {active.brand.name} deliverables
          </h1>
        </div>
      </header>

      <ProductionHero
        brandName={active.brand.name}
        tierLabel={activeTier.tier?.displayName ?? tier.label}
        tierBlurb={activeTier.tier?.blurb ?? tier.blurb}
        balances={balances}
      />

      {activeTier.tier ? (
        <TierCard tier={activeTier.tier} active />
      ) : (
        <ScopePanel tier={tier} balances={balances} />
      )}

      <PipelineView snapshot={pipeline} editorIndex={editorIndex} />

      <AdminShell
        clientId={clientId}
        balances={balances}
        transactions={txRows}
        activeTierDisplayName={activeTier.tier?.displayName ?? null}
        hasMixedTiers={activeTier.mixedTiers}
      />
    </div>
  );
}
