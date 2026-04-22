import { unstable_cache } from 'next/cache';
import { getLastRunPerRoute } from '@/lib/observability/cron-runs';
import { Stat, StatusPill } from '../stat';
import { INFRA_CACHE_TAG, INFRA_CACHE_TTL } from '../cache';

// Cron schedules mirror what's wired in `vercel.json`. Keeping this here (not
// reading vercel.json directly) keeps the UI working even when deployed vs
// running locally, and lets us label crons that haven't run yet.
const CRON_CATALOG: Array<{ route: string; label: string; schedule: string }> = [
  { route: '/api/cron/publish-posts', label: 'Publish scheduled posts', schedule: 'Every 5 min' },
  { route: '/api/cron/benchmark-snapshots', label: 'Benchmark snapshots', schedule: 'Daily' },
  { route: '/api/cron/competitor-snapshots', label: 'Competitor snapshots', schedule: 'Daily' },
  { route: '/api/cron/competitor-reports', label: 'Competitor reports', schedule: 'Daily 14:00 UTC' },
  { route: '/api/cron/weekly-social-report', label: 'Weekly social report', schedule: 'Weekly' },
  { route: '/api/cron/weekly-affiliate-report', label: 'Weekly affiliate report', schedule: 'Weekly' },
  { route: '/api/cron/send-scheduled-emails', label: 'Send scheduled emails', schedule: 'Every 5 min' },
  { route: '/api/cron/sync-reporting', label: 'Sync reporting data', schedule: 'Hourly' },
];

const getCronData = unstable_cache(
  async () => getLastRunPerRoute(),
  ['infrastructure-cron-runs'],
  { revalidate: INFRA_CACHE_TTL, tags: [INFRA_CACHE_TAG] },
);

function formatDuration(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatAge(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export async function CronsTab() {
  const runs = await getCronData();
  const byRoute = new Map(runs.map((r) => [r.route, r]));

  const failing = runs.filter((r) => r.status !== 'ok').length;
  const healthy = runs.filter((r) => r.status === 'ok').length;

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Tracked crons" value={String(CRON_CATALOG.length)} />
        <Stat label="Reporting runs" value={String(runs.length)} />
        <Stat label="Healthy" value={String(healthy)} />
        <Stat label="Failing" value={String(failing)} sub={failing > 0 ? 'needs attention' : undefined} />
      </section>

      <section className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-4 border-b border-nativz-border/60 px-4 py-2 text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">
          <span>Route</span>
          <span className="text-right">Schedule</span>
          <span className="text-right">Last run</span>
          <span className="text-right">Duration</span>
          <span className="text-right">Status</span>
        </div>
        {CRON_CATALOG.map((cron) => {
          const run = byRoute.get(cron.route);
          return (
            <div
              key={cron.route}
              className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-4 border-b border-nativz-border/60 px-4 py-3 text-sm last:border-b-0 hover:bg-surface-hover/40"
            >
              <div className="min-w-0">
                <div className="truncate text-text-primary">{cron.label}</div>
                <div className="truncate font-mono text-[10px] text-text-muted">{cron.route}</div>
              </div>
              <div className="text-right text-xs text-text-muted">{cron.schedule}</div>
              <div className="text-right text-xs tabular-nums text-text-muted">
                {run ? formatAge(run.started_at) : 'never'}
              </div>
              <div className="text-right text-xs tabular-nums text-text-muted">
                {formatDuration(run?.duration_ms ?? null)}
              </div>
              <div className="text-right">
                {run ? <StatusPill status={run.status} /> : <StatusPill status="pending" />}
              </div>
            </div>
          );
        })}
      </section>

      {runs.length === 0 && (
        <p className="text-xs text-text-muted">
          No cron telemetry recorded yet. Rows will appear here as crons execute and call{' '}
          <span className="font-mono">recordCronRun</span> from{' '}
          <span className="font-mono">lib/observability/cron-runs.ts</span>.
        </p>
      )}
    </div>
  );
}
