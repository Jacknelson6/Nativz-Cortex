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
  return 'periods';
}

export default async function AccountingIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const adminClient = createAdminClient();
  const [{ data: userRow }, params] = await Promise.all([
    adminClient.from('users').select('is_super_admin').eq('id', user.id).single(),
    searchParams,
  ]);
  if (!userRow?.is_super_admin) redirect('/admin/dashboard');

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
        description="Bi-monthly payroll periods. First half (1 to 15) and second half (16 to end of month)."
        action={<RefreshButton action={refreshAccounting} />}
      />

      <SectionTabs tabs={ACCOUNTING_TABS} active={activeTab} memoryKey="cortex:accounting:last-tab" />

      <div>{await renderTab(activeTab, adminClient)}</div>
    </div>
  );
}

async function renderTab(slug: AccountingTabSlug, adminClient: ReturnType<typeof createAdminClient>): Promise<React.ReactNode> {
  switch (slug) {
    case 'periods':
      return <PeriodsTab adminClient={adminClient} />;
    case 'approved':
      return <ApprovedCreativesTab adminClient={adminClient} />;
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
      .in('period_id', ids)
      .neq('source', 'auto-deleted');
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
      <div className="rounded-xl border border-nativz-border bg-surface overflow-hidden max-md:overflow-x-auto">
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

/**
 * Approved Creatives tab — per-period roll-up of every approved post that
 * already wrote a `consume` row to `credit_transactions`. Refunded rows
 * (state-based dedup) are netted out so the count matches what
 * `autoPopulateEditingForPeriod` sees when it builds payroll entries.
 *
 * This is the "track approved creatives" surface from NAT-65: a Jack-only
 * sanity check before locking the period and exporting to QuickBooks. The
 * existing Periods tab already drives the actual import, this tab just
 * shows the raw approval signal feeding it.
 */
async function ApprovedCreativesTab({
  adminClient,
}: {
  adminClient: ReturnType<typeof createAdminClient>;
}) {
  const period = currentPeriod();
  const startIso = `${period.startDate}T00:00:00.000Z`;
  const endExclusive = (() => {
    const [y, m, d] = period.endDate.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + 1));
    return dt.toISOString();
  })();

  // Net consume rows in the period: pull every consume + every refund
  // pointing at the same charge unit, drop the consume if the most recent
  // event for that unit is a refund. State-based dedup mirrors
  // `autoPopulateEditingForPeriod` so this view never disagrees with the
  // payroll count.
  const { data: txns } = await adminClient
    .from('credit_transactions')
    .select(
      'id, kind, client_id, editor_user_id, charge_unit_kind, charge_unit_id, scheduled_post_id, revision_count, created_at',
    )
    .in('kind', ['consume', 'refund'])
    .gte('created_at', startIso)
    .lt('created_at', endExclusive)
    .order('created_at', { ascending: true });

  type Txn = {
    id: string;
    kind: 'consume' | 'refund';
    client_id: string | null;
    editor_user_id: string | null;
    charge_unit_kind: 'drop_video' | 'scheduled_post' | null;
    charge_unit_id: string | null;
    scheduled_post_id: string | null;
    revision_count: number | null;
    created_at: string;
  };
  const rows = (txns ?? []) as Txn[];

  // Last-event-wins per charge unit. A refund landing after a consume zeros
  // the consume out; a re-consume after a refund counts again.
  const lastByUnit = new Map<string, Txn>();
  for (const r of rows) {
    if (!r.charge_unit_kind || !r.charge_unit_id) continue;
    const key = `${r.charge_unit_kind}:${r.charge_unit_id}`;
    lastByUnit.set(key, r);
  }
  const liveConsumes = Array.from(lastByUnit.values()).filter(
    (r) => r.kind === 'consume',
  );

  // Aggregate by (client_id, editor_user_id) for the table view.
  const buckets = new Map<
    string,
    { clientId: string | null; editorUserId: string | null; count: number; revisions: number }
  >();
  for (const c of liveConsumes) {
    const key = `${c.client_id ?? 'null'}::${c.editor_user_id ?? 'null'}`;
    const b = buckets.get(key) ?? {
      clientId: c.client_id,
      editorUserId: c.editor_user_id,
      count: 0,
      revisions: 0,
    };
    b.count += 1;
    b.revisions += c.revision_count ?? 0;
    buckets.set(key, b);
  }
  const aggregated = Array.from(buckets.values()).sort((a, b) => b.count - a.count);

  // Hydrate display labels.
  const clientIds = Array.from(
    new Set(aggregated.map((b) => b.clientId).filter((id): id is string => !!id)),
  );
  const editorIds = Array.from(
    new Set(aggregated.map((b) => b.editorUserId).filter((id): id is string => !!id)),
  );
  const [{ data: clients }, { data: members }] = await Promise.all([
    clientIds.length > 0
      ? adminClient.from('clients').select('id, name').in('id', clientIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    editorIds.length > 0
      ? adminClient
          .from('team_members')
          .select('id, user_id, full_name')
          .in('user_id', editorIds)
      : Promise.resolve({ data: [] as { id: string; user_id: string | null; full_name: string | null }[] }),
  ]);
  const clientName = new Map((clients ?? []).map((c) => [c.id, c.name]));
  const editorName = new Map(
    (members ?? [])
      .filter((m) => m.user_id)
      .map((m) => [m.user_id as string, m.full_name ?? '']),
  );

  return (
    <SectionPanel
      title={`Approved this period · ${period.label}`}
      description={`${liveConsumes.length} approved creative${liveConsumes.length === 1 ? '' : 's'} ready to import into accounting. Net of refunds and revoked approvals.`}
    >
      <div className="rounded-xl border border-nativz-border bg-surface overflow-hidden max-md:overflow-x-auto">
        <table className="w-full text-base">
          <thead className="bg-background/50 text-text-secondary">
            <tr>
              <th className="text-left font-semibold px-5 py-3">Client</th>
              <th className="text-left font-semibold px-5 py-3">Editor</th>
              <th className="text-right font-semibold px-5 py-3">Approved</th>
              <th className="text-right font-semibold px-5 py-3">Revisions</th>
            </tr>
          </thead>
          <tbody>
            {aggregated.map((b, i) => (
              <tr key={i} className="border-t border-nativz-border hover:bg-surface-hover/50">
                <td className="px-5 py-3.5 text-text-primary">
                  {b.clientId ? clientName.get(b.clientId) ?? '—' : 'Unattributed'}
                </td>
                <td className="px-5 py-3.5 text-text-secondary">
                  {b.editorUserId ? editorName.get(b.editorUserId) ?? '—' : 'Unassigned'}
                </td>
                <td className="px-5 py-3.5 text-right tabular-nums text-text-primary font-semibold">
                  {b.count}
                </td>
                <td className="px-5 py-3.5 text-right tabular-nums text-text-secondary">
                  {b.revisions}
                </td>
              </tr>
            ))}
            {aggregated.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-text-secondary">
                  Nothing approved yet this period.
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
