import { redirect } from 'next/navigation';
import { Coins } from 'lucide-react';
import { getActiveBrand } from '@/lib/active-brand';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { KpiTile } from '@/components/admin/revenue/kpi-tile';
import { CreditsAdminPanel } from '@/components/credits/credits-admin-panel';
import { CreditsViewerLedger } from '@/components/credits/credits-viewer-ledger';
import type {
  ClientCreditBalanceRow,
  CreditTransactionRow,
} from '@/lib/credits/types';

export const dynamic = 'force-dynamic';

const TX_LIMIT = 50;

/**
 * Brand-root /credits page. Same URL serves admin + viewer roles, body
 * branches on `active.isAdmin`:
 *
 *   - admin  → KPI hero + full management surface (allowance, manual
 *              grant, pause, ledger). Mirrors `/admin/clients/[slug]/credits`
 *              but follows the active brand pill instead of a slug param.
 *   - viewer → KPI hero + read-only ledger + "Buy more credits" CTA.
 *              The CTA points at `/api/credits/checkout` (Phase 5 wires
 *              Stripe).
 *
 * Brand-root pattern: `/calendar`, `/lab`, `/spying`, `/brand-profile`
 * already follow this shape. The active brand is resolved via
 * `getActiveBrand()` (cookie + access table re-auth on every request).
 */
export default async function CreditsPage() {
  const active = await getActiveBrand().catch(() => null);

  // No brand resolved → empty state. Same copy used by /calendar etc.
  if (!active?.brand) {
    return (
      <div className="cortex-page-gutter mx-auto max-w-6xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-text-primary">Credits</h1>
        </header>
        <div className="rounded-xl border border-nativz-border bg-surface p-12 text-center">
          <Coins className="mx-auto mb-3 h-8 w-8 text-text-tertiary" />
          <p className="text-sm text-text-secondary">
            Pick a brand from the top bar to see its credit balance.
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

  // Balance + recent ledger in parallel. Same shape as the admin slug page.
  const [{ data: balance }, { data: txs }] = await Promise.all([
    admin
      .from('client_credit_balances')
      .select(
        'client_id, current_balance, monthly_allowance, rollover_policy, rollover_cap, period_started_at, period_ends_at, next_reset_at, opening_balance_at_period_start, auto_grant_enabled, paused_until, pause_reason, low_balance_email_sent_at, low_balance_email_period_id, overdraft_email_sent_at, overdraft_email_period_id, created_at, updated_at',
      )
      .eq('client_id', clientId)
      .maybeSingle(),
    admin
      .from('credit_transactions')
      .select(
        'id, client_id, kind, delta, charge_unit_kind, charge_unit_id, scheduled_post_id, refund_for_id, share_link_id, reviewer_email, stripe_payment_intent, actor_user_id, note, idempotency_key, created_at',
      )
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(TX_LIMIT),
  ]);

  const balanceRow = (balance as ClientCreditBalanceRow | null) ?? null;
  const txRows = (txs as CreditTransactionRow[] | null) ?? [];

  const currentBalance = balanceRow?.current_balance ?? 0;
  const allowance = balanceRow?.monthly_allowance ?? 0;
  const rollover = balanceRow?.rollover_policy ?? 'none';
  const rolloverCap = balanceRow?.rollover_cap ?? null;
  const isPausedIndefinite = balanceRow?.auto_grant_enabled === false;
  // eslint-disable-next-line react-hooks/purity -- server component, runs once per request
  const nowMs = Date.now();
  const isPausedTimeBound =
    !!balanceRow?.paused_until && new Date(balanceRow.paused_until).getTime() > nowMs;
  const paused = isPausedIndefinite || isPausedTimeBound;

  const balanceTone: 'good' | 'warn' | 'err' | 'neutral' =
    currentBalance < 0 ? 'err' : currentBalance === 0 ? 'warn' : 'good';

  const nextResetLabel = balanceRow?.next_reset_at
    ? new Date(balanceRow.next_reset_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '—';

  const rolloverSub =
    rollover === 'none'
      ? 'No rollover'
      : rollover === 'unlimited'
        ? 'Unlimited rollover'
        : `Cap ${rolloverCap ?? 0}`;

  return (
    <div className="cortex-page-gutter mx-auto max-w-6xl space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-text/80">
          {active.isAdmin ? 'Cortex · admin · credits' : 'Cortex · credits'}
        </p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-text-primary">
              {active.brand.name} credits
            </h1>
            {paused ? (
              <span className="inline-flex items-center rounded-full border border-amber-300/40 bg-amber-300/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                {isPausedIndefinite ? 'Paused' : 'Paused until reset'}
              </span>
            ) : null}
          </div>
        </div>
        {!active.isAdmin ? (
          <p className="max-w-prose text-sm text-text-secondary">
            One credit covers one approved short-form post. Approving a post in your calendar
            uses one credit; if you change your mind and unapprove, the credit is refunded.
          </p>
        ) : null}
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile label="Balance" value={String(currentBalance)} tone={balanceTone} />
        <KpiTile label="Allowance" value={String(allowance)} sub="per month" />
        <KpiTile label="Rollover" value={rollover} sub={rolloverSub} />
        <KpiTile label="Next reset" value={nextResetLabel} />
      </div>

      {active.isAdmin ? (
        <CreditsAdminPanel
          clientId={clientId}
          balance={balanceRow}
          transactions={txRows}
        />
      ) : (
        <CreditsViewerLedger
          balance={balanceRow}
          transactions={txRows}
          clientName={active.brand.name}
        />
      )}
    </div>
  );
}
