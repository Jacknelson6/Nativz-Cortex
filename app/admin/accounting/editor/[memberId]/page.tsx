import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft, ExternalLink } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { centsToDollars, labelFor } from '@/lib/accounting/periods';

export const dynamic = 'force-dynamic';

type EntryType = 'editing' | 'smm' | 'affiliate' | 'blogging' | 'override' | 'misc';
type PayoutStatus = 'pending' | 'link_received' | 'paid';

interface RawEntry {
  id: string;
  entry_type: EntryType;
  period_id: string;
  client_id: string | null;
  video_count: number;
  rate_cents: number;
  amount_cents: number;
  margin_cents: number;
  description: string | null;
  created_at: string;
}

interface RawPeriod {
  id: string;
  start_date: string;
  end_date: string;
  half: 'first-half' | 'second-half';
  status: 'draft' | 'locked' | 'paid';
}

interface RawPayout {
  id: string;
  period_id: string;
  wise_url: string | null;
  status: PayoutStatus;
  notes: string | null;
  paid_at: string | null;
}

interface RawClient {
  id: string;
  name: string;
}

interface PeriodGroup {
  period: RawPeriod;
  label: string;
  entries: RawEntry[];
  payout: RawPayout | null;
  total_cents: number;
  margin_cents: number;
  video_count: number;
  entry_types: Set<string>;
}

const STATUS_LABELS: Record<PayoutStatus, string> = {
  pending: 'Pending',
  link_received: 'Link received',
  paid: 'Paid',
};

const STATUS_TONE: Record<PayoutStatus, string> = {
  pending: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  link_received: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  paid: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
};

const PERIOD_STATUS_TONE: Record<'draft' | 'locked' | 'paid', string> = {
  draft: 'bg-surface-hover text-text-secondary border-nativz-border',
  locked: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  paid: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
};

const TYPE_BADGE: Record<string, string> = {
  editing: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  smm: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  affiliate: 'bg-pink-500/15 text-pink-300 border-pink-500/30',
  blogging: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
  override: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
  misc: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
};

export default async function EditorCrossPeriodPage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  const { memberId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const adminClient = createAdminClient();

  const [
    { data: userRow },
    { data: member },
    { data: entries },
    { data: payouts },
    { data: periods },
    { data: clients },
  ] = await Promise.all([
    adminClient.from('users').select('is_super_admin').eq('id', user.id).single(),
    adminClient
      .from('team_members')
      .select('id, full_name, role, editing_roles, is_active, avatar_url')
      .eq('id', memberId)
      .maybeSingle(),
    adminClient
      .from('payroll_entries')
      .select('id, entry_type, period_id, client_id, video_count, rate_cents, amount_cents, margin_cents, description, created_at')
      .eq('team_member_id', memberId),
    adminClient
      .from('payroll_payouts')
      .select('id, period_id, wise_url, status, notes, paid_at')
      .eq('team_member_id', memberId),
    adminClient
      .from('payroll_periods')
      .select('id, start_date, end_date, half, status')
      .order('start_date', { ascending: false }),
    adminClient.from('clients').select('id, name'),
  ]);

  if (!userRow?.is_super_admin) redirect('/admin/dashboard');
  if (!member) notFound();

  const entriesArr = (entries ?? []) as RawEntry[];
  const payoutsArr = (payouts ?? []) as RawPayout[];
  const periodsArr = (periods ?? []) as RawPeriod[];
  const clientsArr = (clients ?? []) as RawClient[];

  const periodById = new Map(periodsArr.map((p) => [p.id, p]));
  const payoutByPeriod = new Map(payoutsArr.map((p) => [p.period_id, p]));
  const clientById = new Map(clientsArr.map((c) => [c.id, c]));

  // Group entries by period (only periods that have at least one entry).
  const groupsMap = new Map<string, PeriodGroup>();
  for (const e of entriesArr) {
    const period = periodById.get(e.period_id);
    if (!period) continue;
    const existing = groupsMap.get(period.id);
    if (existing) {
      existing.entries.push(e);
      existing.total_cents += e.amount_cents ?? 0;
      existing.margin_cents += e.margin_cents ?? 0;
      existing.video_count += e.video_count ?? 0;
      existing.entry_types.add(e.entry_type);
    } else {
      groupsMap.set(period.id, {
        period,
        label: labelFor(period.start_date, period.half),
        entries: [e],
        payout: payoutByPeriod.get(period.id) ?? null,
        total_cents: e.amount_cents ?? 0,
        margin_cents: e.margin_cents ?? 0,
        video_count: e.video_count ?? 0,
        entry_types: new Set([e.entry_type]),
      });
    }
  }

  const groups = Array.from(groupsMap.values()).sort((a, b) =>
    a.period.start_date < b.period.start_date ? 1 : -1,
  );

  const lifetime = {
    total_cents: groups.reduce((s, g) => s + g.total_cents, 0),
    margin_cents: groups.reduce((s, g) => s + g.margin_cents, 0),
    video_count: groups.reduce((s, g) => s + g.video_count, 0),
    period_count: groups.length,
    entry_count: entriesArr.length,
  };

  // Per-client lifetime stats — useful sidebar view.
  const clientStats = new Map<string, { name: string; videos: number; total: number; margin: number; entries: number }>();
  for (const e of entriesArr) {
    const cid = e.client_id ?? '__none__';
    const name = e.client_id ? (clientById.get(e.client_id)?.name ?? 'Unknown') : 'No client';
    const row = clientStats.get(cid) ?? { name, videos: 0, total: 0, margin: 0, entries: 0 };
    row.videos += e.video_count ?? 0;
    row.total += e.amount_cents ?? 0;
    row.margin += e.margin_cents ?? 0;
    row.entries += 1;
    clientStats.set(cid, row);
  }
  const clientRows = Array.from(clientStats.values()).sort((a, b) => b.total - a.total);

  const editingRoles: string[] = (member as { editing_roles?: string[] | null }).editing_roles ?? [];
  const isInactive = (member as { is_active?: boolean | null }).is_active === false;

  return (
    <div className="cortex-page-gutter max-w-7xl mx-auto space-y-6">
      <div>
        <Link
          href="/admin/accounting?tab=periods"
          className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
        >
          <ChevronLeft size={14} /> Accounting
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-text-secondary font-semibold">Editor view</p>
          <h1 className="text-3xl font-bold text-text-primary mt-1">{member.full_name ?? 'Unnamed'}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-text-secondary">
            {member.role && <span>{member.role}</span>}
            {editingRoles.length > 0 && (
              <span className="flex flex-wrap gap-1">
                {editingRoles.map((r) => (
                  <span
                    key={r}
                    className="inline-flex rounded-md border border-nativz-border bg-surface px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-secondary"
                  >
                    {r}
                  </span>
                ))}
              </span>
            )}
            {isInactive && (
              <span className="inline-flex rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300">
                inactive
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Lifetime payout" value={centsToDollars(lifetime.total_cents)} />
        <StatCard
          label="Lifetime margin"
          value={centsToDollars(lifetime.margin_cents)}
          tone={lifetime.margin_cents < 0 ? 'negative' : lifetime.margin_cents > 0 ? 'positive' : 'neutral'}
        />
        <StatCard label="Videos" value={lifetime.video_count.toLocaleString()} />
        <StatCard label="Pay periods" value={lifetime.period_count.toLocaleString()} sub={`${lifetime.entry_count} entries`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-text-primary">Pay periods</h2>
            <p className="text-xs text-text-muted">Most recent first</p>
          </div>

          {groups.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-nativz-border bg-surface px-4 py-12 text-center text-sm text-text-secondary">
              No payroll entries yet for this editor.
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-nativz-border bg-surface">
              <ul className="divide-y divide-nativz-border">
                {groups.map((g) => (
                  <PeriodCard key={g.period.id} group={g} clientById={clientById} />
                ))}
              </ul>
            </div>
          )}
        </section>

        <aside className="space-y-3">
          <h2 className="text-lg font-semibold text-text-primary">By client</h2>
          {clientRows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-nativz-border bg-surface px-4 py-8 text-center text-xs text-text-muted">
              No client breakdown yet.
            </div>
          ) : (
            <ul className="overflow-hidden rounded-2xl border border-nativz-border bg-surface divide-y divide-nativz-border">
              {clientRows.map((row, i) => (
                <li key={i} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-text-primary">{row.name}</p>
                    <p className="shrink-0 text-sm font-semibold tabular-nums text-text-primary">
                      {centsToDollars(row.total)}
                    </p>
                  </div>
                  <p className="mt-0.5 flex items-center justify-between text-xs text-text-muted">
                    <span>
                      {row.videos > 0 ? `${row.videos} videos · ` : ''}
                      {row.entries} {row.entries === 1 ? 'entry' : 'entries'}
                    </span>
                    {row.margin !== 0 && (
                      <span className={row.margin < 0 ? 'text-red-400' : 'text-emerald-400'}>
                        {centsToDollars(row.margin)} margin
                      </span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'positive' | 'negative' | 'neutral';
}) {
  const valueClass =
    tone === 'positive'
      ? 'text-emerald-400'
      : tone === 'negative'
      ? 'text-red-400'
      : 'text-text-primary';
  return (
    <div className="rounded-2xl border border-nativz-border bg-surface px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-text-muted font-semibold">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${valueClass}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-text-muted">{sub}</p>}
    </div>
  );
}

function PeriodCard({
  group,
  clientById,
}: {
  group: PeriodGroup;
  clientById: Map<string, RawClient>;
}) {
  const { period, label, entries, total_cents, margin_cents, video_count, entry_types, payout } = group;
  const types = Array.from(entry_types).sort();

  return (
    <li>
      <details className="group">
        <summary className="grid cursor-pointer grid-cols-[minmax(160px,1.4fr)_minmax(110px,0.8fr)_minmax(90px,0.7fr)_minmax(90px,0.7fr)_minmax(160px,1.2fr)_minmax(120px,0.7fr)] items-center gap-3 px-4 py-3 hover:bg-surface-hover">
          <div className="min-w-0">
            <Link
              href={`/admin/accounting/${period.id}?tab=payouts`}
              className="text-sm font-semibold text-text-primary hover:text-accent-text"
            >
              {label}
            </Link>
            <p className="mt-0.5 text-[11px] text-text-muted">
              {video_count > 0 && `${video_count} videos · `}
              {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            {types.map((t) => (
              <span
                key={t}
                className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${TYPE_BADGE[t] ?? TYPE_BADGE.misc}`}
              >
                {t}
              </span>
            ))}
          </div>
          <span className="text-right text-sm font-semibold tabular-nums text-text-primary">
            {centsToDollars(total_cents)}
          </span>
          <span
            className={`text-right text-sm tabular-nums ${
              margin_cents === 0
                ? 'text-text-muted'
                : margin_cents < 0
                ? 'text-red-400'
                : 'text-emerald-400'
            }`}
          >
            {margin_cents === 0 ? '—' : centsToDollars(margin_cents)}
          </span>
          <div className="min-w-0 truncate text-xs">
            {payout?.wise_url ? (
              <a
                href={payout.wise_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-accent-text hover:underline"
                title={payout.wise_url}
              >
                <ExternalLink size={11} /> Wise link
              </a>
            ) : (
              <span className="text-text-muted">No link yet</span>
            )}
          </div>
          <div className="flex items-center justify-end gap-2">
            <span
              className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                STATUS_TONE[payout?.status ?? 'pending']
              }`}
            >
              {STATUS_LABELS[payout?.status ?? 'pending']}
            </span>
            <span
              className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                PERIOD_STATUS_TONE[period.status]
              }`}
              title={`Period ${period.status}`}
            >
              {period.status}
            </span>
          </div>
        </summary>
        <div className="border-t border-nativz-border bg-background/40 px-4 py-3">
          <table className="w-full text-xs">
            <thead className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
              <tr>
                <th className="py-1.5 pr-3 text-left">Type</th>
                <th className="py-1.5 pr-3 text-left">Client</th>
                <th className="py-1.5 pr-3 text-right">Videos</th>
                <th className="py-1.5 pr-3 text-right">Rate</th>
                <th className="py-1.5 pr-3 text-right">Amount</th>
                <th className="py-1.5 pr-3 text-right">Margin</th>
                <th className="py-1.5 text-left">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-nativz-border/60">
              {entries.map((e) => (
                <tr key={e.id} className="text-text-secondary">
                  <td className="py-1.5 pr-3 capitalize">{e.entry_type}</td>
                  <td className="py-1.5 pr-3 text-text-primary">
                    {e.client_id ? clientById.get(e.client_id)?.name ?? '—' : '—'}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{e.video_count || '—'}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    {e.rate_cents ? centsToDollars(e.rate_cents) : '—'}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-text-primary">
                    {centsToDollars(e.amount_cents)}
                  </td>
                  <td
                    className={`py-1.5 pr-3 text-right tabular-nums ${
                      e.margin_cents === 0
                        ? 'text-text-muted'
                        : e.margin_cents < 0
                        ? 'text-red-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    {e.margin_cents === 0 ? '—' : centsToDollars(e.margin_cents)}
                  </td>
                  <td className="py-1.5 text-text-muted">{e.description ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {payout?.notes && (
            <p className="mt-3 rounded-md border border-nativz-border bg-surface px-3 py-2 text-xs text-text-secondary">
              <span className="text-text-muted">Note: </span>
              {payout.notes}
            </p>
          )}
        </div>
      </details>
    </li>
  );
}
