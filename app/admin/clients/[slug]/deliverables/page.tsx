import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { LifecycleStatePill } from '@/components/admin/revenue/status-pill';
import { ProductionHero } from '@/components/deliverables/production-hero';
import { ScopePanel } from '@/components/deliverables/scope-panel';
import { AdminShell } from '@/components/deliverables/admin-shell';
import { getDeliverableBalances } from '@/lib/deliverables/get-balances';
import { inferScopeTier } from '@/lib/deliverables/scope';
import type { CreditTransactionRow } from '@/lib/credits/types';

export const dynamic = 'force-dynamic';

const TX_LIMIT = 50;

/**
 * Per-client admin deliverables surface, accessed through the client
 * management flow at `/admin/clients/[slug]/deliverables`.
 *
 * Mirrors the brand-root `/deliverables` admin path but keyed by slug so
 * an internal team member managing a single client doesn't need to swap
 * the active brand pill first. Same shell, same components, same data
 * loaders, scoped by the slug param.
 *
 * Replaces the legacy `/credits` per-client admin page in the directional
 * pivot (Phase B). Internal labels in the shell still say "credits"
 * because this is admin-only and the team thinks in accounting terms;
 * client-visible strings route through `lib/deliverables/copy.ts`.
 */
export default async function ClientDeliverablesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  const isAdmin =
    (me as { is_super_admin?: boolean | null } | null)?.is_super_admin === true ||
    me?.role === 'admin' ||
    me?.role === 'super_admin';
  if (!isAdmin) notFound();

  const { data: client } = await admin
    .from('clients')
    .select('id, name, slug, lifecycle_state')
    .eq('slug', slug)
    .single();
  if (!client) notFound();

  const [balances, txResult] = await Promise.all([
    getDeliverableBalances(admin, client.id),
    admin
      .from('credit_transactions')
      .select(
        'id, client_id, deliverable_type_id, kind, delta, charge_unit_kind, charge_unit_id, scheduled_post_id, refund_for_id, share_link_id, reviewer_email, stripe_payment_intent, actor_user_id, note, idempotency_key, created_at',
      )
      .eq('client_id', client.id)
      .order('created_at', { ascending: false })
      .limit(TX_LIMIT)
      .returns<CreditTransactionRow[]>(),
  ]);

  const txRows = txResult.data ?? [];
  const tier = inferScopeTier(balances);

  const lifecycleState =
    (client as { lifecycle_state?: string | null }).lifecycle_state ?? 'lead';

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-text/80">
          Cortex · admin · deliverables
        </p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="ui-page-title">{client.name}</h1>
            <LifecycleStatePill state={lifecycleState} />
          </div>
        </div>
      </header>

      <ProductionHero
        brandName={client.name}
        tierLabel={tier.label}
        tierBlurb={tier.blurb}
        balances={balances}
      />

      <ScopePanel tier={tier} balances={balances} />

      <AdminShell clientId={client.id} balances={balances} transactions={txRows} />
    </div>
  );
}
