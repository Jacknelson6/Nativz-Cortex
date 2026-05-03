import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';

export const maxDuration = 60;

/**
 * GET /api/cron/credits-reconcile
 *
 * Daily ledger-gap detection. Schedule: `0 5 * * *` (UTC) — one hour after
 * the reset cron so any month-boundary work has settled.
 *
 * For each row in `client_credit_balances` (one per (client, deliverable_type)
 * after migration 221):
 *
 *   expected_balance = opening_balance_at_period_start
 *                    + Σ delta from credit_transactions
 *                      WHERE client_id = b.client_id
 *                      AND deliverable_type_id = b.deliverable_type_id
 *                      AND created_at >= b.period_started_at
 *
 * If `expected_balance != current_balance`, insert a row into
 * `credit_ledger_gaps` keyed on (client_id, deliverable_type_id). Read-only
 * against the ledger by design — auto-correction would mask whatever bug
 * created the drift. The daily admin digest surfaces gap counts and routes to
 * manual `adjust` for resolution.
 *
 * The cross-period refund case (consume in period N, refund in period N+1)
 * is handled correctly: the refund's +1 delta lands inside period N+1's
 * window, and `opening_balance_at_period_start` was snapshotted at the
 * moment period N+1 started so the math reconciles cleanly.
 *
 * Skips rows that already have an open gap (`resolved_at IS NULL`) detected
 * within the last 24h on the SAME (client, type), so a sustained drift on
 * one type doesn't suppress real drift on another.
 *
 * @auth Bearer CRON_SECRET (Vercel cron)
 */

interface BalanceRow {
  client_id: string;
  deliverable_type_id: string;
  current_balance: number;
  opening_balance_at_period_start: number;
  period_started_at: string;
}

async function handleGet(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: balances, error: scanErr } = await admin
    .from('client_credit_balances')
    .select(
      'client_id, deliverable_type_id, current_balance, opening_balance_at_period_start, period_started_at',
    )
    .returns<BalanceRow[]>();
  if (scanErr) {
    console.error('[credits.reconcile] scan failed:', scanErr.message);
    return NextResponse.json({ error: scanErr.message }, { status: 500 });
  }

  // Pre-load open gaps so we can suppress duplicates without a per-row query.
  // Keyed (client_id, deliverable_type_id) so a sustained drift on edited_video
  // doesn't suppress new ugc_video drift detection.
  const cutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: openGaps } = await admin
    .from('credit_ledger_gaps')
    .select('client_id, deliverable_type_id')
    .is('resolved_at', null)
    .gte('detected_at', cutoffIso)
    .returns<Array<{ client_id: string | null; deliverable_type_id: string | null }>>();
  const recentlyFlagged = new Set(
    (openGaps ?? [])
      .filter((g): g is { client_id: string; deliverable_type_id: string } =>
        !!g.client_id && !!g.deliverable_type_id,
      )
      .map((g) => `${g.client_id}:${g.deliverable_type_id}`),
  );

  let checked = 0;
  let drifted = 0;
  let suppressed = 0;
  let errored = 0;
  const drifts: Array<{
    client_id: string;
    deliverable_type_id: string;
    expected: number;
    actual: number;
    drift: number;
  }> = [];

  for (const row of balances ?? []) {
    checked += 1;
    try {
      // Sum deltas inside the current period for THIS (client, type). Pulls
      // rows rather than using a server-side aggregate so the scan rides the
      // new (client_id, deliverable_type_id, created_at DESC) index. At ~50
      // active clients × ~3 types × <100 rows/period this is well under a
      // second.
      const { data: txs, error: sumErr } = await admin
        .from('credit_transactions')
        .select('delta')
        .eq('client_id', row.client_id)
        .eq('deliverable_type_id', row.deliverable_type_id)
        .gte('created_at', row.period_started_at)
        .returns<Array<{ delta: number }>>();
      if (sumErr) {
        errored += 1;
        console.error(
          `[credits.reconcile] (${row.client_id}, ${row.deliverable_type_id}) sum failed: ${sumErr.message}`,
        );
        continue;
      }
      const sum = (txs ?? []).reduce((acc, t) => acc + (t.delta ?? 0), 0);
      const expected = row.opening_balance_at_period_start + sum;
      if (expected === row.current_balance) continue;

      drifts.push({
        client_id: row.client_id,
        deliverable_type_id: row.deliverable_type_id,
        expected,
        actual: row.current_balance,
        drift: row.current_balance - expected,
      });

      const key = `${row.client_id}:${row.deliverable_type_id}`;
      if (recentlyFlagged.has(key)) {
        suppressed += 1;
        continue;
      }

      const { error: insertErr } = await admin.from('credit_ledger_gaps').insert({
        client_id: row.client_id,
        deliverable_type_id: row.deliverable_type_id,
        expected_balance: expected,
        actual_balance: row.current_balance,
      });
      if (insertErr) {
        errored += 1;
        console.error(
          `[credits.reconcile] (${row.client_id}, ${row.deliverable_type_id}) insert failed: ${insertErr.message}`,
        );
        continue;
      }
      drifted += 1;
    } catch (err) {
      errored += 1;
      console.error(
        `[credits.reconcile] (${row.client_id}, ${row.deliverable_type_id}) threw:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return NextResponse.json({
    ok: true,
    checked,
    drifted,
    suppressed,
    errored,
    sample: drifts.slice(0, 10), // first 10 for the cron run log
  });
}

export const GET = withCronTelemetry(
  {
    route: '/api/cron/credits-reconcile',
    extractRowsProcessed: (body) =>
      typeof body === 'object' && body !== null && 'checked' in body
        ? Number((body as { checked: unknown }).checked) || 0
        : undefined,
  },
  handleGet,
);
