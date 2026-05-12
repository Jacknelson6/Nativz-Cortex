/**
 * Publish-pipeline SLO data layer.
 *
 * The SLO: a scheduled post should publish within 5 minutes of its
 * `scheduled_at`. Anything past that drifts the calendar grid the
 * share-link viewer renders and erodes trust ("the post we approved
 * for 10am didn't actually go up until 10:14").
 *
 * Buckets are Chicago-local days keyed on `scheduled_at`, not
 * `published_at`. That way a post scheduled for Monday but published
 * Tuesday because of a stall counts against Monday's SLO — which is
 * the day the user feels the miss.
 */
import type { createAdminClient } from '@/lib/supabase/admin';

type AdminClient = ReturnType<typeof createAdminClient>;

export const SLO_WINDOW_MINUTES = 5;

export interface PublishSloDailyRow {
  day: string;
  total: number;
  published_in_window: number;
  published_late: number;
  failed_or_partial: number;
  stuck: number;
}

interface ScheduledPostSloShape {
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
}

interface DayCounts {
  total: number;
  publishedInWindow: number;
  publishedLate: number;
  failedOrPartial: number;
  stuck: number;
}

const TERMINAL_FAILED = new Set(['failed', 'partially_failed']);
const TERMINAL_PUBLISHED = 'published';

/**
 * Convert an ISO instant into a YYYY-MM-DD Chicago-local day string.
 * Mirrors `todayChicago()` in publish-health-digest so all SLO buckets
 * agree with what the morning digest considers "yesterday."
 */
function chicagoDay(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

/**
 * Pull every scheduled_posts row whose `scheduled_at` lies in the
 * requested range, then bucket by Chicago day. The range bounds are
 * UTC instants — the caller already widened them past the Chicago
 * boundary so days near a DST flip don't lose rows.
 */
export async function computeSloBuckets(
  admin: AdminClient,
  fromIso: string,
  toIso: string,
): Promise<Map<string, DayCounts>> {
  const PAGE = 1000;
  const buckets = new Map<string, DayCounts>();
  let offset = 0;
  while (true) {
    const { data, error } = await admin
      .from('scheduled_posts')
      .select('status, scheduled_at, published_at')
      .gte('scheduled_at', fromIso)
      .lt('scheduled_at', toIso)
      .order('scheduled_at', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`scheduled_posts query failed: ${error.message}`);
    const rows = (data ?? []) as ScheduledPostSloShape[];
    if (rows.length === 0) break;

    for (const row of rows) {
      if (!row.scheduled_at) continue;
      const day = chicagoDay(row.scheduled_at);
      const cur = buckets.get(day) ?? {
        total: 0,
        publishedInWindow: 0,
        publishedLate: 0,
        failedOrPartial: 0,
        stuck: 0,
      };
      cur.total += 1;

      if (row.status === TERMINAL_PUBLISHED) {
        if (row.published_at) {
          const lagMs = Date.parse(row.published_at) - Date.parse(row.scheduled_at);
          if (lagMs <= SLO_WINDOW_MINUTES * 60 * 1000) cur.publishedInWindow += 1;
          else cur.publishedLate += 1;
        } else {
          // Edge case: status=published but no published_at stamp. Treat as
          // late rather than in-window so a stale row doesn't inflate the SLO.
          cur.publishedLate += 1;
        }
      } else if (TERMINAL_FAILED.has(row.status)) {
        cur.failedOrPartial += 1;
      } else {
        // scheduled / publishing / cancelled all collapse into "stuck" for
        // SLO purposes — none of them met the publish-within-5min bar.
        cur.stuck += 1;
      }

      buckets.set(day, cur);
    }

    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return buckets;
}

/**
 * Upsert one bucket per day in the map. Re-running the cron heals drift
 * because each row is keyed on `day` (PK).
 */
export async function upsertSloRows(
  admin: AdminClient,
  buckets: Map<string, DayCounts>,
): Promise<number> {
  if (buckets.size === 0) return 0;
  const rows = Array.from(buckets.entries()).map(([day, c]) => ({
    day,
    total: c.total,
    published_in_window: c.publishedInWindow,
    published_late: c.publishedLate,
    failed_or_partial: c.failedOrPartial,
    stuck: c.stuck,
    computed_at: new Date().toISOString(),
  }));
  const { error } = await admin
    .from('publish_slo_daily')
    .upsert(rows, { onConflict: 'day' });
  if (error) throw new Error(`publish_slo_daily upsert failed: ${error.message}`);
  return rows.length;
}

/**
 * Load the most recent N days of SLO rollups for the dashboard widget.
 * Returns an array sorted oldest-first so the chart x-axis flows left
 * to right naturally.
 */
export async function fetchRecentSlo(
  admin: AdminClient,
  days: number,
): Promise<PublishSloDailyRow[]> {
  const { data, error } = await admin
    .from('publish_slo_daily')
    .select('day, total, published_in_window, published_late, failed_or_partial, stuck')
    .order('day', { ascending: false })
    .limit(days);
  if (error) throw new Error(`publish_slo_daily fetch failed: ${error.message}`);
  return ((data ?? []) as PublishSloDailyRow[]).slice().reverse();
}

export function sloRatio(row: PublishSloDailyRow): number {
  if (row.total === 0) return 1;
  return row.published_in_window / row.total;
}
