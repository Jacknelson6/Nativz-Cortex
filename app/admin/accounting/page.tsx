import { redirect } from 'next/navigation';
import { after } from 'next/server';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { currentPeriod, labelFor, centsToDollars } from '@/lib/accounting/periods';
import {
  SectionTabs,
  SectionHeader,
  SectionPanel,
} from '@/components/admin/section-tabs';
import {
  ACCOUNTING_TABS,
  ACCOUNTING_TAB_SLUGS,
  type AccountingTabSlug,
} from '@/components/admin/accounting/accounting-tabs';
import { AccountingOverviewTab } from '@/components/admin/accounting/overview-tab';
import { RefreshButton } from '@/components/admin/shared/refresh-button';
import { refreshAccounting } from './actions';

export const dynamic = 'force-dynamic';

interface PeriodRow {
  id: string;
  start_date: string;
  end_date: string;
  half: 'first-half' | 'second-half';
  status: 'draft' | 'locked' | 'paid';
  notes: string | null;
  locked_at: string | null;
  paid_at: string | null;
}

interface EntryRow {
  period_id: string;
  amount_cents: number;
  margin_cents: number;
}

function resolveTab(raw: string | undefined): AccountingTabSlug {
  if (raw && (ACCOUNTING_TAB_SLUGS as readonly string[]).includes(raw)) {
    return raw as AccountingTabSlug;
  }
  return 'overview';
}

export default async function AccountingIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');

  const adminClient = createAdminClient();
  const [{ data: userRow }, params] = await Promise.all([
    adminClient.from('users').select('role').eq('id', user.id).single(),
    searchParams,
  ]);
  if (userRow?.role !== 'admin') redirect('/admin/dashboard');

  // Period upsert runs off the critical path — it was adding a round-trip
  // to every page load even though its result doesn't feed the render.
  after(async () => {
    try {
      const cur = currentPeriod();
      await adminClient
        .from('payroll_periods')
        .upsert(
          { start_date: cur.startDate, end_date: cur.endDate, half: cur.half, status: 'draft', created_by: user.id },
          { onConflict: 'start_date,end_date', ignoreDuplicates: true },
        );
    } catch (err) {
      console.error('[accounting] current-period upsert failed (non-fatal):', err);
    }
  });

  const activeTab = resolveTab(params.tab);

  return (
    <div className="cortex-page-gutter max-w-6xl mx-auto space-y-8">
      <SectionHeader
        title="Accounting"
        description="Bi-monthly payroll periods. First half (1–15) and second half (16–end of month). Pick a tab to drill in."
        action={<RefreshButton action={refreshAccounting} />}
      />

      <SectionTabs tabs={ACCOUNTING_TABS} active={activeTab} memoryKey="cortex:accounting:last-tab" />

      <div>{await renderTab(activeTab, adminClient)}</div>
    </div>
  );
}

async function renderTab(slug: AccountingTabSlug, adminClient: ReturnType<typeof createAdminClient>): Promise<React.ReactNode> {
  switch (slug) {
    case 'overview':
      return <AccountingOverviewTab />;
    case 'year':
      return (
        <SectionPanel
          title="Year view"
          description="Monthly payout + margin roll-up across the calendar year."
        >
          <Link
            href="/admin/accounting/year"
            className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent-text transition-colors hover:border-accent/60 hover:bg-accent/20"
          >
            Open year view →
          </Link>
        </SectionPanel>
      );
    case 'periods':
      return <PeriodsTab adminClient={adminClient} />;
  }
}

async function PeriodsTab({ adminClient }: { adminClient: ReturnType<typeof createAdminClient> }) {
  const { data: periods } = await adminClient
    .from('payroll_periods')
    .select('id, start_date, end_date, half, status, notes, locked_at, paid_at')
    .order('start_date', { ascending: false })
    .limit(24);

  const periodRows = (periods ?? []) as PeriodRow[];
  const ids = periodRows.map((p) => p.id);
  const totals: Record<string, { amount: number; margin: number; count: number }> = {};
  if (ids.length > 0) {
    const { data: entries } = await adminClient
      .from('payroll_entries')
      .select('period_id, amount_cents, margin_cents')
      .in('period_id', ids);
    for (const e of (entries ?? []) as EntryRow[]) {
      const row = (totals[e.period_id] ??= { amount: 0, margin: 0, count: 0 });
      row.amount += e.amount_cents ?? 0;
      row.margin += e.margin_cents ?? 0;
      row.count += 1;
    }
  }

  return (
    <SectionPanel
      title="Periods"
      description="Recent 24 bi-monthly periods. Click a row to open entries, lock, or mark paid."
    >
      <div className="rounded-xl border border-nativz-border bg-surface overflow-hidden">
        <table className="w-full text-base">
          <thead className="bg-background/50 text-text-secondary">
            <tr>
              <th className="text-left font-semibold px-5 py-3">Period</th>
              <th className="text-left font-semibold px-5 py-3">Status</th>
              <th className="text-right font-semibold px-5 py-3">Entries</th>
              <th className="text-right font-semibold px-5 py-3">Payouts</th>
              <th className="text-right font-semibold px-5 py-3">Margin</th>
            </tr>
          </thead>
          <tbody>
            {periodRows.map((p) => {
              const t = totals[p.id] ?? { amount: 0, margin: 0, count: 0 };
              return (
                <tr key={p.id} className="border-t border-nativz-border hover:bg-surface-hover/50">
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/admin/accounting/${p.id}`}
                      className="text-text-primary font-semibold hover:text-accent-text"
                    >
                      {labelFor(p.start_date, p.half)}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusPill status={p.status} />
                  </td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-text-primary">
                    {t.count}
                  </td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-text-primary font-semibold">
                    {centsToDollars(t.amount)}
                  </td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-text-secondary">
                    {centsToDollars(t.margin)}
                  </td>
                </tr>
              );
            })}
            {periodRows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-text-secondary">
                  No periods yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </SectionPanel>
  );
}

function StatusPill({ status }: { status: 'draft' | 'locked' | 'paid' }) {
  const config = {
    draft: 'bg-surface-hover text-text-primary',
    locked: 'bg-amber-500/15 text-amber-400',
    paid: 'bg-emerald-500/15 text-emerald-400',
  }[status];
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-sm font-medium ${config}`}>
      {status}
    </span>
  );
}
