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
 * Per migration 221 the balance table is keyed on (client_id, deliverable_type_id),
 * so the eligibility scan returns one row per (client, type). We dedupe to a
 * unique client_id list before iterating because `monthly_reset_for_client`
 * loops every type row for that client internally — calling it per (client,
 * type) row would double-process.
 *
 * The DB function `monthly_reset_for_client` is at-least-once safe per type:
 * for each type row it takes `FOR UPDATE` and re-checks `next_reset_at <=
 * now()` inside the lock, so a duplicate Vercel invocation (deploy mid-cron,
 * function timeout retry) writes ONE grant row at most per type.
 *
 * Result shape: `{not_found: true} | {per_type_results: [{type_id, result}]}`
 * where each per-type result is the old per-row branch (`reset` |
 * `already_reset` | `zero_allowance_advanced` | `skipped_paused` | `not_found`).
 * We tally counts across the entire batch's per-type results so the cron log
 * answers "how many grants landed tonight" not "how many clients were
 * touched."
 *
 * Per-client failure isolation: each call is wrapped in try/catch so one
 * corrupt row doesn't block the rest of the batch. `next_reset_at` stays in
 * the past for the failing client; the next nightly run picks them up after
 * the underlying issue is fixed.
 *
 * Batch ceiling: 500 unique clients per invocation. We currently have ~50
 * active clients, the ceiling is precautionary — at 500+ rows the next-minute
 * Vercel retry cleans up the tail. If the ceiling is hit we surface
 * `partial: true` so the cron telemetry logs a partial run.
 *
 * Zero-allowance rows (free-tier, internal demos) flow through the same RPC;
 * each per-type row branches internally and returns
 * `zero_allowance_advanced: true` after bumping period dates without writing
 * a ledger row.
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

  // Per-(client, type) eligibility scan. Postgres handles the pause-aware
  // predicate via the partial index on next_reset_at.
  const { data: dueRows, error: scanErr } = await admin
    .from('client_credit_balances')
    .select('client_id, deliverable_type_id, monthly_allowance, paused_until')
    .lte('next_reset_at', nowIso)
    .eq('auto_grant_enabled', true)
    .or(`paused_until.is.null,paused_until.lt.${nowIso}`)
    .returns<Array<{
      client_id: string;
      deliverable_type_id: string;
      monthly_allowance: number;
      paused_until: string | null;
    }>>();

  if (scanErr) {
    console.error('[credits.reset] scan failed:', scanErr.message);
    return NextResponse.json({ error: scanErr.message }, { status: 500 });
  }

  // Dedupe to unique client ids — `monthly_reset_for_client` already loops
  // every type row for the client internally, so processing one type row
  // is the same work as processing all of them.
  const allRows = dueRows ?? [];
  const uniqueClientIds = Array.from(new Set(allRows.map((r) => r.client_id)));
  const partial = uniqueClientIds.length > BATCH_CEILING;
  const toProcess = uniqueClientIds.slice(0, BATCH_CEILING);

  // Per-type-result tallies aggregated across every (client, type) the RPC
  // touched in this batch. "Granted" counts ledger rows actually written;
  // a single client with 3 type rows can contribute up to 3 to `granted`.
  let granted = 0;
  let alreadyReset = 0;
  let zeroAdvanced = 0;
  let skippedPaused = 0;
  let perTypeNotFound = 0;
  let errored = 0;

  for (const clientId of toProcess) {
    try {
      const { data, error } = await admin.rpc('monthly_reset_for_client', {
        p_client_id: clientId,
      });
      if (error) {
        errored += 1;
        console.error(
          `[credits.reset] client ${clientId} rpc failed: ${error.message}`,
        );
        continue;
      }
      const result = data as MonthlyResetResult;
      if ('not_found' in result) {
        // Whole client has no balance rows — likely deleted between scan and
        // RPC. Silent skip, not an error.
        continue;
      }
      for (const entry of result.per_type_results) {
        const r = entry.result;
        if ('reset' in r && r.reset) granted += 1;
        else if ('already_reset' in r) alreadyReset += 1;
        else if ('zero_allowance_advanced' in r) zeroAdvanced += 1;
        else if ('skipped_paused' in r) skippedPaused += 1;
        else if ('not_found' in r) perTypeNotFound += 1;
      }
    } catch (err) {
      errored += 1;
      console.error(
        `[credits.reset] client ${clientId} threw:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return NextResponse.json({
    ok: true,
    scanned_rows: allRows.length,
    scanned_clients: uniqueClientIds.length,
    processed: toProcess.length,
    granted,
    already_reset: alreadyReset,
    zero_advanced: zeroAdvanced,
    skipped_paused: skippedPaused,
    per_type_not_found: perTypeNotFound,
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
