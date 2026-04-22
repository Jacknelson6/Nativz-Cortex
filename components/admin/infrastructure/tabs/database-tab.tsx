import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { Stat } from '../stat';
import { INFRA_CACHE_TAG } from '../cache';

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

const getTableCounts = unstable_cache(
  async () => {
    const admin = createAdminClient();
    const results = await Promise.all(
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
    return results;
  },
  ['infrastructure-db-counts'],
  { revalidate: 60, tags: [INFRA_CACHE_TAG] },
);

export async function DatabaseTab() {
  const counts = await getTableCounts();
  const errored = counts.filter((c) => c.error).length;
  const totalRows = counts.reduce((acc, c) => acc + (c.count ?? 0), 0);

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Tracked tables" value={String(TRACKED_TABLES.length)} />
        <Stat label="Total rows" value={totalRows.toLocaleString()} />
        <Stat
          label="Tables reachable"
          value={String(counts.length - errored)}
          sub={errored > 0 ? `${errored} failing` : undefined}
        />
        <Stat label="Schema cursor" value="139" sub="latest migration" />
      </section>

      <section className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
        <div className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-nativz-border/60 px-4 py-2 text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">
          <span>Table</span>
          <span className="text-right">Row count</span>
        </div>
        {counts
          .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
          .map((row) => (
            <div
              key={row.name}
              className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-nativz-border/60 px-4 py-2.5 text-sm last:border-b-0 hover:bg-surface-hover/40"
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
                  <span className="text-text-primary">{(row.count ?? 0).toLocaleString()}</span>
                )}
              </div>
            </div>
          ))}
      </section>

      <p className="text-[11px] text-text-muted">
        Row counts are live (30s cache). Supabase exposes `pg_stat_activity` etc. through direct Postgres
        access — live connection / cache stats are future work pending a read-only pooler role.
      </p>
    </div>
  );
}
