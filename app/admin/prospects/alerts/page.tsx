// SPY-06 T27: global prospect-monitor alert feed. Filter pills for
// severity / kind / acknowledged. Server component queries via the
// admin client directly (cheaper than fetching our own API in-process).

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { AlertFeed } from '@/components/prospects/alert-feed';
import { ALERT_KIND_LABELS } from '@/lib/prospects/delta-rules';
import type { AlertKind, AlertSeverity, ProspectMonitorAlertRow } from '@/lib/prospects/types';

export const dynamic = 'force-dynamic';

type SearchParams = {
  severity?: string;
  kind?: string;
  acknowledged?: string;
  since?: string;
  [key: string]: string | undefined;
};

const SEVERITIES: AlertSeverity[] = ['high', 'medium', 'low'];
const KINDS: AlertKind[] = ['follower_jump', 'viral_post', 'cadence_shift', 'format_pivot'];
const ACK_OPTIONS = [
  { v: 'unack', l: 'Unacked' },
  { v: 'acked', l: 'Acked' },
  { v: 'all', l: 'All' },
];

function buildHref(base: Record<string, string | undefined>, patch: Record<string, string | undefined>): string {
  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...base, ...patch })) {
    if (v) merged[k] = v;
  }
  const qs = new URLSearchParams(merged).toString();
  return qs ? `/admin/prospects/alerts?${qs}` : '/admin/prospects/alerts';
}

function Pill({
  active,
  href,
  children,
}: {
  active: boolean;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs transition-colors ${
        active
          ? 'border-accent bg-accent/10 text-accent'
          : 'border-border bg-surface text-text-muted hover:text-foreground'
      }`}
    >
      {children}
    </Link>
  );
}

export default async function GlobalAlertsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
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
  if (!isAdmin) redirect('/');

  const ack = params.acknowledged ?? 'unack';

  let query = admin
    .from('prospect_monitor_alerts')
    .select('*, prospect:prospects(id, brand_name)')
    .order('occurred_at', { ascending: false })
    .limit(100);

  if (params.severity && SEVERITIES.includes(params.severity as AlertSeverity)) {
    query = query.eq('severity', params.severity);
  }
  if (params.kind && KINDS.includes(params.kind as AlertKind)) {
    query = query.eq('kind', params.kind);
  }
  if (ack === 'unack') query = query.is('acknowledged_at', null);
  if (ack === 'acked') query = query.not('acknowledged_at', 'is', null);
  if (params.since) query = query.gte('occurred_at', params.since);

  const { data: alerts } = await query;

  const rows = (alerts ?? []) as Array<
    ProspectMonitorAlertRow & { prospect?: { id: string; brand_name: string } | null }
  >;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Prospect alerts</h1>
        <p className="text-sm text-text-muted">
          Cross-prospect feed of competitor shifts the weekly monitor surfaced.
        </p>
      </header>

      <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-text-muted">Status</span>
          {ACK_OPTIONS.map((opt) => (
            <Pill
              key={opt.v}
              active={ack === opt.v}
              href={buildHref(params, { acknowledged: opt.v })}
            >
              {opt.l}
            </Pill>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-text-muted">Severity</span>
          <Pill active={!params.severity} href={buildHref(params, { severity: undefined })}>
            All
          </Pill>
          {SEVERITIES.map((s) => (
            <Pill key={s} active={params.severity === s} href={buildHref(params, { severity: s })}>
              {s}
            </Pill>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-text-muted">Kind</span>
          <Pill active={!params.kind} href={buildHref(params, { kind: undefined })}>
            All
          </Pill>
          {KINDS.map((k) => (
            <Pill key={k} active={params.kind === k} href={buildHref(params, { kind: k })}>
              {ALERT_KIND_LABELS[k]}
            </Pill>
          ))}
        </div>
      </div>

      <AlertFeed alerts={rows} showProspect />
    </div>
  );
}
