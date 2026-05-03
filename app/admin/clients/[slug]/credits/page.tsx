import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { KpiTile } from '@/components/admin/revenue/kpi-tile';
import { LifecycleStatePill } from '@/components/admin/revenue/status-pill';
import { CreditsAdminPanel } from '@/components/credits/credits-admin-panel';
import type {
  ClientCreditBalanceRow,
  CreditTransactionRow,
} from '@/lib/credits/types';

export const dynamic = 'force-dynamic';

const TX_LIMIT = 50;

export default async function ClientCreditsPage({
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

  // Fetch balance + recent ledger in parallel.
  const [{ data: balance }, { data: txs }] = await Promise.all([
    admin
      .from('client_credit_balances')
      .select(
        'client_id, current_balance, monthly_allowance, rollover_policy, rollover_cap, period_started_at, period_ends_at, next_reset_at, opening_balance_at_period_start, auto_grant_enabled, paused_until, pause_reason, low_balance_email_sent_at, low_balance_email_period_id, overdraft_email_sent_at, overdraft_email_period_id, created_at, updated_at',
      )
      .eq('client_id', client.id)
      .maybeSingle(),
    admin
      .from('credit_transactions')
      .select(
        'id, client_id, kind, delta, charge_unit_kind, charge_unit_id, scheduled_post_id, refund_for_id, share_link_id, reviewer_email, stripe_payment_intent, actor_user_id, note, idempotency_key, created_at',
      )
      .eq('client_id', client.id)
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
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-text/80">
          Cortex · admin · credits
        </p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="ui-page-title">{client.name}</h1>
            <LifecycleStatePill
              state={(client as { lifecycle_state?: string | null }).lifecycle_state ?? 'lead'}
            />
            {paused ? (
              <span className="inline-flex items-center rounded-full border border-amber-300/40 bg-amber-300/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                {isPausedIndefinite ? 'Paused' : 'Paused until reset'}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile label="Balance" value={String(currentBalance)} tone={balanceTone} />
        <KpiTile label="Allowance" value={String(allowance)} sub="per month" />
        <KpiTile label="Rollover" value={rollover} sub={rolloverSub} />
        <KpiTile label="Next reset" value={nextResetLabel} />
      </div>

      <CreditsAdminPanel
        clientId={client.id}
        balance={balanceRow}
        transactions={txRows}
      />
    </div>
  );
}
