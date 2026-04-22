import { createAdminClient } from '@/lib/supabase/admin';

type CronStatus = 'ok' | 'error' | 'partial';

export interface CronRunRecord {
  route: string;
  status: CronStatus;
  startedAt: Date;
  rowsProcessed?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Record the outcome of a cron run in the cron_runs table. Always silent on
 * failure — observability should never crash the cron. Meant to be called
 * once per route, near the end of the handler, after the real work is done.
 */
export async function recordCronRun(run: CronRunRecord): Promise<void> {
  try {
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - run.startedAt.getTime();
    const admin = createAdminClient();
    await admin.from('cron_runs').insert({
      route: run.route,
      status: run.status,
      started_at: run.startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_ms: durationMs,
      rows_processed: run.rowsProcessed ?? null,
      error: run.error ? run.error.slice(0, 1000) : null,
      metadata: run.metadata ?? {},
    });
  } catch (err) {
    console.error('[cron-runs] failed to record', run.route, err);
  }
}

/**
 * Pull the most recent run per distinct cron route. Used by the Infrastructure
 * v2 Crons tab. Returns rows sorted by `route` asc so the UI can group
 * consistently regardless of run order.
 */
export async function getLastRunPerRoute(): Promise<Array<{
  route: string;
  status: CronStatus;
  started_at: string;
  duration_ms: number | null;
  rows_processed: number | null;
  error: string | null;
}>> {
  const admin = createAdminClient();
  // Supabase doesn't expose DISTINCT ON from PostgREST directly; pull the
  // last ~500 runs and collapse client-side. Cheap and good enough for a
  // dashboard query wrapped in unstable_cache.
  const { data, error } = await admin
    .from('cron_runs')
    .select('route, status, started_at, duration_ms, rows_processed, error')
    .order('started_at', { ascending: false })
    .limit(500);

  if (error || !data) return [];

  const latestByRoute = new Map<string, (typeof data)[number]>();
  for (const row of data) {
    if (!latestByRoute.has(row.route)) latestByRoute.set(row.route, row);
  }
  return [...latestByRoute.values()].sort((a, b) => a.route.localeCompare(b.route));
}

export async function getRecentFailuresByRoute(route: string, limit = 10) {
  const admin = createAdminClient();
  const { data } = await admin
    .from('cron_runs')
    .select('started_at, duration_ms, error, metadata')
    .eq('route', route)
    .neq('status', 'ok')
    .order('started_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}
