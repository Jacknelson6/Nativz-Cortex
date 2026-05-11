import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';

export const maxDuration = 300;

/**
 * Monthly calendar project auto-generator.
 *
 * Runs at 06:00 UTC on the 1st of each month. For every active SMM client
 * with `monthly_calendar_post_count > 0`, creates a new
 * `editing_projects` row of `project_type = 'calendar'` for the NEXT
 * calendar month, named e.g. "February 2026".
 *
 * Idempotent. Before inserting, the cron checks for an existing calendar
 * project that already represents the target month:
 *   1. Name contains the target month name (case-insensitive). The name
 *      always wins, so a manually-renamed "March 2026 + Influencer push"
 *      blocks the auto-generator from doubling up.
 *   2. Falls back to created_at: if a project has NO month name in its
 *      title and was created within the target month (or the cron run
 *      month, which is one prior), it is treated as that month calendar.
 *
 * Query params (manual-run only):
 *   ?clientId=<uuid>  : process one client only
 *   ?targetMonth=YYYY-MM : override the target month (e.g. backfill)
 *
 * Auth: Bearer ${CRON_SECRET} header, same pattern as the other crons.
 */

type ClientRow = {
  id: string;
  name: string;
  monthly_calendar_post_count: number;
  default_strategist_id: string | null;
  default_editor_id: string | null;
};

type CalendarProjectRow = {
  id: string;
  name: string;
  created_at: string;
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/**
 * Compute the target month for THIS run. By default we step forward one
 * month from the cron run date (Jan 1 yields the February calendar). An
 * explicit `?targetMonth=YYYY-MM` override skips the derivation.
 */
function resolveTargetMonth(now: Date, override: string | null): { year: number; monthIndex: number } {
  if (override) {
    const match = /^(\d{4})-(\d{2})$/.exec(override.trim());
    if (match) {
      const year = Number.parseInt(match[1], 10);
      const monthIndex = Number.parseInt(match[2], 10) - 1;
      if (Number.isFinite(year) && monthIndex >= 0 && monthIndex <= 11) {
        return { year, monthIndex };
      }
    }
  }
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { year: next.getUTCFullYear(), monthIndex: next.getUTCMonth() };
}

/**
 * Find any month-name token in a project title. Match is case-insensitive
 * and word-bounded so "Marsha birthday spot" does not read as "March".
 */
function findMonthInName(name: string): number | null {
  const lower = name.toLowerCase();
  for (let i = 0; i < MONTH_NAMES.length; i += 1) {
    const token = MONTH_NAMES[i].toLowerCase();
    const re = new RegExp(`\\b${token}\\b`);
    if (re.test(lower)) return i;
  }
  return null;
}

/**
 * Does an existing calendar project already represent (targetYear, targetMonth)?
 *
 * Rule 1: name contains the target month name (yes, regardless of year)
 *         per the stated intent that "March" in the title supercedes the
 *         date. Cross-year duplicates are vanishingly rare; the bigger
 *         risk is double-creating within the same year, which this catches.
 * Rule 2: no month name in title yields a fallback to created_at month.
 *         Since the cron creates a project for the next month on the 1st
 *         of the run month, created_at landing in either month counts.
 */
function projectRepresentsMonth(
  project: CalendarProjectRow,
  targetYear: number,
  targetMonthIndex: number,
  runYear: number,
  runMonthIndex: number,
): boolean {
  const nameMonth = findMonthInName(project.name);
  if (nameMonth !== null) {
    return nameMonth === targetMonthIndex;
  }
  const created = new Date(project.created_at);
  if (!Number.isFinite(created.valueOf())) return false;
  const cy = created.getUTCFullYear();
  const cm = created.getUTCMonth();
  if (cy === targetYear && cm === targetMonthIndex) return true;
  if (cy === runYear && cm === runMonthIndex) return true;
  return false;
}

async function handleGet(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const forcedClientId = req.nextUrl.searchParams.get('clientId');
  const forcedMonth = req.nextUrl.searchParams.get('targetMonth');

  const { year: targetYear, monthIndex: targetMonthIndex } = resolveTargetMonth(now, forcedMonth);
  const targetMonthName = MONTH_NAMES[targetMonthIndex];
  const targetLabel = `${targetMonthName} ${targetYear}`;

  let clientQuery = admin
    .from('clients')
    .select(
      'id, name, monthly_calendar_post_count, services, is_active, is_paused, default_strategist_id, default_editor_id',
    )
    .eq('is_active', true)
    .gt('monthly_calendar_post_count', 0)
    .contains('services', ['SMM']);

  if (forcedClientId) {
    clientQuery = clientQuery.eq('id', forcedClientId);
  }

  const { data: clientRows, error: clientErr } = await clientQuery.returns<
    Array<{
      id: string;
      name: string;
      monthly_calendar_post_count: number;
      services: string[] | null;
      is_active: boolean;
      is_paused: boolean | null;
      default_strategist_id: string | null;
      default_editor_id: string | null;
    }>
  >();
  if (clientErr) {
    return NextResponse.json({ error: clientErr.message }, { status: 500 });
  }

  // Paused clients are filtered in JS so we do not have to deal with the
  // (false OR null) condition through PostgREST. `is_paused` is nullable
  // on some legacy rows; treat null as not-paused.
  const candidates: ClientRow[] = (clientRows ?? [])
    .filter((c) => !c.is_paused)
    .map((c) => ({
      id: c.id,
      name: c.name,
      monthly_calendar_post_count: c.monthly_calendar_post_count,
      default_strategist_id: c.default_strategist_id,
      default_editor_id: c.default_editor_id,
    }));

  if (candidates.length === 0) {
    return NextResponse.json({
      success: true,
      target: targetLabel,
      processed: 0,
      created: 0,
      skipped: 0,
      results: [],
    });
  }

  // One read for all candidate clients existing calendar projects.
  const candidateIds = candidates.map((c) => c.id);
  const { data: existingRows, error: existingErr } = await admin
    .from('editing_projects')
    .select('id, name, created_at, client_id')
    .eq('project_type', 'calendar')
    .in('client_id', candidateIds)
    .returns<Array<CalendarProjectRow & { client_id: string }>>();
  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 });
  }

  const existingByClient = new Map<string, CalendarProjectRow[]>();
  for (const row of existingRows ?? []) {
    const bucket = existingByClient.get(row.client_id) ?? [];
    bucket.push({ id: row.id, name: row.name, created_at: row.created_at });
    existingByClient.set(row.client_id, bucket);
  }

  type Result = {
    clientId: string;
    clientName: string;
    action: 'created' | 'skipped';
    reason?: string;
    projectId?: string;
  };
  const results: Result[] = [];
  let created = 0;
  let skipped = 0;

  for (const c of candidates) {
    const existing = existingByClient.get(c.id) ?? [];
    const dupe = existing.find((p) =>
      projectRepresentsMonth(
        p,
        targetYear,
        targetMonthIndex,
        now.getUTCFullYear(),
        now.getUTCMonth(),
      ),
    );
    if (dupe) {
      skipped += 1;
      results.push({
        clientId: c.id,
        clientName: c.name,
        action: 'skipped',
        reason: `existing project ${dupe.id} ("${dupe.name}")`,
      });
      continue;
    }

    const { data: inserted, error: insertErr } = await admin
      .from('editing_projects')
      .insert({
        client_id: c.id,
        name: targetLabel,
        project_type: 'calendar',
        // Auto-fill strategist/editor from the brand's account-level
        // defaults (migration 240). Either may be null — the cron has
        // no creator to fall back to, so unassigned stays unassigned
        // until the team sets a default or picks manually.
        strategist_id: c.default_strategist_id,
        editor_id: c.default_editor_id,
      })
      .select('id')
      .single();

    if (insertErr || !inserted) {
      results.push({
        clientId: c.id,
        clientName: c.name,
        action: 'skipped',
        reason: `insert_failed: ${insertErr?.message ?? 'unknown'}`,
      });
      skipped += 1;
      continue;
    }

    created += 1;
    results.push({
      clientId: c.id,
      clientName: c.name,
      action: 'created',
      projectId: inserted.id as string,
    });
  }

  return NextResponse.json({
    success: true,
    target: targetLabel,
    processed: candidates.length,
    created,
    skipped,
    results,
  });
}

export const GET = withCronTelemetry(
  {
    route: '/api/cron/generate-monthly-calendars',
    extractRowsProcessed: (body) => {
      const count = (body as { created?: number } | null)?.created;
      return typeof count === 'number' ? count : undefined;
    },
  },
  handleGet,
);
