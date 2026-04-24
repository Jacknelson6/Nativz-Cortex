/**
 * Infrastructure › Supabase — data plane.
 *
 * Consolidates what used to live on the old "Database" tab and adds
 * project-level signals (auth user counts, storage totals, recent migrations,
 * latest activity). Everything queries Postgres / auth via the service-role
 * admin client — no Management API calls, so no extra tokens to wire.
 */

import { unstable_cache } from 'next/cache';
import { Database, KeyRound, ShieldCheck, Users } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { Stat } from '../stat';
import { Disclosure } from '../section-card';
import { INFRA_CACHE_TAG, INFRA_CACHE_TTL } from '../cache';

const TRACKED_TABLES: Array<{ name: string; label: string }> = [
  { name: 'clients', label: 'Clients' },
  { name: 'users', label: 'Users' },
  { name: 'team_members', label: 'Team members' },
  { name: 'topic_searches', label: 'Topic searches' },
  { name: 'topic_search_runs', label: 'Topic search runs' },
  { name: 'prospect_audits', label: 'Audits' },
  { name: 'client_benchmarks', label: 'Benchmarks' },
  { name: 'benchmark_snapshots', label: 'Benchmark snapshots' },
  { name: 'knowledge_entries', label: 'Knowledge entries' },
  { name: 'nerd_conversations', label: 'Nerd conversations' },
  { name: 'nerd_artifacts', label: 'Nerd artifacts' },
  { name: 'payroll_periods', label: 'Payroll periods' },
  { name: 'payroll_entries', label: 'Payroll entries' },
  { name: 'scheduled_emails', label: 'Scheduled emails' },
  { name: 'cron_runs', label: 'Cron runs' },
];

function extractProjectRef(url: string | undefined): string | null {
  if (!url) return null;
  const match = url.match(/^https?:\/\/([a-z0-9]+)\.supabase\.co/i);
  return match ? match[1] : null;
}

interface SupabaseRollup {
  projectRef: string | null;
  projectUrl: string;
  authUsers: number | null;
  rowCounts: Array<{ name: string; label: string; count: number | null; error: string | null }>;
  totalRows: number;
  tablesReachable: number;
  tablesFailing: number;
  latestMigration: string | null;
  migrationCount: number | null;
  lastTopicSearchAt: string | null;
  lastCronAt: string | null;
  apifyRowsTotal: number;
}

const getSupabaseRollup = unstable_cache(
  async (): Promise<SupabaseRollup> => {
    const admin = createAdminClient();
    const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

    // Table row counts — one HEAD per table, tolerant of failures.
    const rowCounts = await Promise.all(
      TRACKED_TABLES.map(async ({ name, label }) => {
        try {
          const { count } = await admin.from(name).select('*', { count: 'exact', head: true });
          return { name, label, count: count ?? 0, error: null as string | null };
        } catch (err) {
          return {
            name,
            label,
            count: null,
            error: err instanceof Error ? err.message : 'unknown error',
          };
        }
      }),
    );

    // Extra signals: auth users, latest migration, last-activity timestamps.
    const [authUsers, migrations, lastSearch, lastCron, apifyCount] = await Promise.all([
      (async () => {
        try {
          const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
          // Supabase returns `total` on listUsers — fall back to -1 if missing.
          const total = (data as unknown as { total?: number }).total;
          return typeof total === 'number' ? total : data.users.length;
        } catch {
          return null;
        }
      })(),
      (async () => {
        try {
          const { data } = await admin
            .from('schema_migrations')
            .select('filename')
            .order('filename', { ascending: false })
            .limit(1);
          const { count } = await admin
            .from('schema_migrations')
            .select('filename', { count: 'exact', head: true });
          return { latest: data?.[0]?.filename ?? null, total: count ?? null };
        } catch {
          return { latest: null, total: null };
        }
      })(),
      (async () => {
        try {
          const { data } = await admin
            .from('topic_searches')
            .select('created_at')
            .order('created_at', { ascending: false })
            .limit(1);
          return data?.[0]?.created_at ?? null;
        } catch {
          return null;
        }
      })(),
      (async () => {
        try {
          const { data } = await admin
            .from('cron_runs')
            .select('started_at')
            .order('started_at', { ascending: false })
            .limit(1);
          return data?.[0]?.started_at ?? null;
        } catch {
          return null;
        }
      })(),
      (async () => {
        try {
          const { count } = await admin
            .from('apify_runs')
            .select('*', { count: 'exact', head: true });
          return count ?? 0;
        } catch {
          return 0;
        }
      })(),
    ]);

    const reachable = rowCounts.filter((r) => !r.error);
    const failing = rowCounts.filter((r) => r.error);

    return {
      projectRef: extractProjectRef(projectUrl),
      projectUrl,
      authUsers,
      rowCounts,
      totalRows: rowCounts.reduce((sum, r) => sum + (r.count ?? 0), 0),
      tablesReachable: reachable.length,
      tablesFailing: failing.length,
      latestMigration: migrations.latest,
      migrationCount: migrations.total,
      lastTopicSearchAt: lastSearch,
      lastCronAt: lastCron,
      apifyRowsTotal: apifyCount,
    };
  },
  ['infrastructure-supabase-rollup'],
  { revalidate: INFRA_CACHE_TTL, tags: [INFRA_CACHE_TAG] },
);

function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export async function SupabaseTab() {
  const data = await getSupabaseRollup();
  const dashboardUrl = data.projectRef
    ? `https://supabase.com/dashboard/project/${data.projectRef}`
    : 'https://supabase.com/dashboard';

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Project ref"
          value={data.projectRef ?? '—'}
          sub="phypsgxszrvwdaaqpxup · us-west"
        />
        <Stat
          label="Auth users"
          value={data.authUsers != null ? data.authUsers.toLocaleString() : '—'}
          sub="Admin + portal combined"
        />
        <Stat
          label="Tables tracked"
          value={String(TRACKED_TABLES.length)}
          sub={
            data.tablesFailing > 0
              ? `${data.tablesFailing} failing`
              : `${data.tablesReachable} reachable`
          }
        />
        <Stat
          label="Total rows"
          value={data.totalRows.toLocaleString()}
          sub="Sum across tracked tables"
        />
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-nativz-border bg-surface p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-300">
                <Database size={16} />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-text-primary">Project</h3>
                <p className="text-[11px] text-text-muted">Postgres, auth, storage, RLS.</p>
              </div>
            </div>
            <a
              href={dashboardUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-accent-text underline decoration-dotted"
            >
              Open dashboard →
            </a>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <Meta label="URL" value={data.projectUrl || '—'} mono truncate />
            <Meta
              label="Region"
              value="US West (aws-us-west-1)"
            />
            <Meta
              label="Service key"
              value={process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Configured' : 'Missing'}
              tone={process.env.SUPABASE_SERVICE_ROLE_KEY ? 'ok' : 'err'}
            />
            <Meta
              label="Anon key"
              value={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Configured' : 'Missing'}
              tone={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'ok' : 'err'}
            />
          </dl>
        </div>

        <div className="rounded-xl border border-nativz-border bg-surface p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent-text">
                <ShieldCheck size={16} />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-text-primary">Schema</h3>
                <p className="text-[11px] text-text-muted">Tracked via migration cursor.</p>
              </div>
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <Meta
              label="Latest migration"
              value={data.latestMigration ?? '—'}
              mono
            />
            <Meta
              label="Applied count"
              value={data.migrationCount != null ? String(data.migrationCount) : '—'}
            />
            <Meta
              label="Last search"
              value={formatRelative(data.lastTopicSearchAt)}
            />
            <Meta
              label="Last cron tick"
              value={formatRelative(data.lastCronAt)}
            />
          </dl>
        </div>
      </section>

      <Disclosure
        summary="Tables · row counts (30s cache)"
        count={TRACKED_TABLES.length}
      >
        <div className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-nativz-border/60 pb-2 text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">
          <span>Table</span>
          <span className="text-right">Rows</span>
        </div>
        {[...data.rowCounts]
          .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
          .map((row) => (
            <div
              key={row.name}
              className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-nativz-border/40 py-2 text-sm last:border-b-0"
            >
              <div className="min-w-0">
                <div className="truncate text-text-primary">{row.label}</div>
                <div className="truncate font-mono text-[10px] text-text-muted">{row.name}</div>
              </div>
              <div className="text-right tabular-nums">
                {row.error ? (
                  <span className="text-coral-300" title={row.error}>
                    error
                  </span>
                ) : (
                  <span className="text-text-primary">
                    {(row.count ?? 0).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          ))}
      </Disclosure>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <LinkCard
          icon={<Users size={14} />}
          title="Auth"
          href={dashboardUrl + '/auth/users'}
          primary={`${data.authUsers != null ? data.authUsers.toLocaleString() : '—'} users`}
          secondary="Manage sessions, MFA, invite tokens."
        />
        <LinkCard
          icon={<KeyRound size={14} />}
          title="SQL editor"
          href={dashboardUrl + '/sql/new'}
          primary="Open editor"
          secondary="Ad-hoc queries scoped by service role."
        />
      </section>

      <p className="text-[11px] text-text-muted">
        Row counts are live (30s cache). Connection and cache stats require a read-only pooler
        role — on the backlog. For deeper dashboards use the
        {' '}
        <a
          href={dashboardUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent-text underline decoration-dotted"
        >
          Supabase console
        </a>
        .
      </p>
    </div>
  );
}

function Meta({
  label,
  value,
  mono,
  truncate,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  truncate?: boolean;
  tone?: 'ok' | 'err';
}) {
  const toneClass =
    tone === 'ok'
      ? 'text-emerald-300'
      : tone === 'err'
        ? 'text-coral-300'
        : 'text-text-primary';
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-text-muted">{label}</div>
      <div
        className={
          `mt-0.5 text-xs ${toneClass} ${mono ? 'font-mono' : ''} ${truncate ? 'truncate' : ''}`
        }
        title={truncate ? value : undefined}
      >
        {value}
      </div>
    </div>
  );
}

function LinkCard({
  icon,
  title,
  href,
  primary,
  secondary,
}: {
  icon: React.ReactNode;
  title: string;
  href: string;
  primary: string;
  secondary: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-start gap-3 rounded-xl border border-nativz-border bg-surface p-4 transition-colors hover:border-accent/40 hover:bg-surface-hover/30"
    >
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-300">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          {title}
          <span className="text-[10px] text-text-muted transition-transform group-hover:translate-x-0.5">
            ↗
          </span>
        </div>
        <div className="mt-0.5 text-xs text-text-primary">{primary}</div>
        <div className="mt-0.5 text-[11px] text-text-muted">{secondary}</div>
      </div>
    </a>
  );
}
