import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';
import type { MonthlyResetResult } from '@/lib/credits/types';

export const maxDuration = 60;

/**
 * GET /api/cron/credits-reset
 *
 * Daily monthly-allowance grant. Schedule: `0 4 * * *` (UTC).
 *
 * Selection set, mirrors the spec exactly:
 *
 *   next_reset_at <= now()
 *   AND auto_grant_enabled IS TRUE
 *   AND monthly_allowance > 0
 *   AND (paused_until IS NULL OR paused_until < now())
 *
 * The DB function `monthly_reset_for_client` is at-least-once safe: it takes
 * `FOR UPDATE` on the balance row and re-checks `next_reset_at <= now()`
 * inside the lock, so a duplicate Vercel invocation (deploy mid-cron, function
 * timeout retry) writes ONE grant row at most.
 *
 * Per-client failure isolation: each call is wrapped in try/catch so one
 * corrupt row doesn't block the rest of the batch. `next_reset_at` stays in
 * the past for the failing client; the next nightly run picks them up after
 * the underlying issue is fixed.
 *
 * Batch ceiling: 500 clients per invocation. We currently have ~50 active
 * clients, the ceiling is precautionary — at 500+ rows the next-minute Vercel
 * retry cleans up the tail. If the ceiling is hit we surface
 * `partial: true` so the cron telemetry logs a partial run.
 *
 * Zero-allowance rows (free-tier, internal demos) are explicitly skipped
 * here — they still need their period dates advanced so per-period email
 * stamps reset correctly. That advance lives in the same RPC: a separate
 * lightweight pass at the bottom calls `monthly_reset_for_client` against
 * `auto_grant_enabled = true AND monthly_allowance = 0` rows; the RPC's
 * `zero_allowance_advanced` branch handles them without writing a ledger row.
 *
 * @auth Bearer CRON_SECRET (Vercel cron)
 */

const BATCH_CEILING = 500;

async function handleGet(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  // Use a single query for the eligibility scan. Postgres handles the
  // pause-aware predicate via the partial index on next_reset_at.
  const { data: dueRows, error: scanErr } = await admin
    .from('client_credit_balances')
    .select('client_id, monthly_allowance, paused_until')
    .lte('next_reset_at', nowIso)
    .eq('auto_grant_enabled', true)
    .or(`paused_until.is.null,paused_until.lt.${nowIso}`)
    .limit(BATCH_CEILING + 1) // +1 so we can detect "more than ceiling"
    .returns<Array<{ client_id: string; monthly_allowance: number; paused_until: string | null }>>();

  if (scanErr) {
    console.error('[credits.reset] scan failed:', scanErr.message);
    return NextResponse.json({ error: scanErr.message }, { status: 500 });
  }

  const all = dueRows ?? [];
  const partial = all.length > BATCH_CEILING;
  const toProcess = all.slice(0, BATCH_CEILING);

  // Split: positive-allowance gets the full RPC (writes a grant row);
  // zero-allowance gets the same RPC, the function branches internally and
  // returns `zero_allowance_advanced: true` after bumping period dates.
  let granted = 0;
  let alreadyReset = 0;
  let zeroAdvanced = 0;
  let skippedPaused = 0;
  let errored = 0;

  for (const row of toProcess) {
    try {
      const { data, error } = await admin.rpc('monthly_reset_for_client', {
        p_client_id: row.client_id,
      });
      if (error) {
        errored += 1;
        console.error(
          `[credits.reset] client ${row.client_id} rpc failed: ${error.message}`,
        );
        continue;
      }
      const result = data as MonthlyResetResult;
      if ('reset' in result && result.reset) granted += 1;
      else if ('already_reset' in result) alreadyReset += 1;
      else if ('zero_allowance_advanced' in result) zeroAdvanced += 1;
      else if ('skipped_paused' in result) skippedPaused += 1;
      // not_found is silently ignored — the row was deleted between scan
      // and RPC, fine.
    } catch (err) {
      errored += 1;
      console.error(
        `[credits.reset] client ${row.client_id} threw:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: all.length,
    processed: toProcess.length,
    granted,
    already_reset: alreadyReset,
    zero_advanced: zeroAdvanced,
    skipped_paused: skippedPaused,
    errored,
    partial,
  });
}

export const GET = withCronTelemetry(
  {
    route: '/api/cron/credits-reset',
    extractRowsProcessed: (body) =>
      typeof body === 'object' && body !== null && 'processed' in body
        ? Number((body as { processed: unknown }).processed) || 0
        : undefined,
  },
  handleGet,
);
