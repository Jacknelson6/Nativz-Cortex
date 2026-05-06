import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';

export const maxDuration = 300;

/**
 * Monthly deliverable slot generator.
 *
 * Runs at 06:00 UTC on the 1st of each month. For every active client with
 * a `package_tier_id`, reads `package_tier_allotments` for that tier and
 * inserts one row per (deliverable_type, slot_index) into
 * `monthly_deliverable_slots` for the current month.
 *
 * Idempotent: the table's UNIQUE (client_id, month_start, deliverable_type_id,
 * slot_index) constraint plus an explicit `onConflict: 'do nothing'` upsert
 * makes re-runs (or a retry after a partial failure) safe — already-inserted
 * slots are skipped.
 *
 * `?clientId=<uuid>` query param forces a one-client run for manual testing.
 */

type AllotmentRow = {
  package_tier_id: string;
  deliverable_type_id: string;
  monthly_count: number;
};

type ActiveClient = {
  client_id: string;
  package_tier_id: string;
};

function firstOfThisMonthUTC(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

async function handleGet(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const monthStart = firstOfThisMonthUTC();
  const forcedClientId = req.nextUrl.searchParams.get('clientId');

  // Distinct (client_id, package_tier_id) pairs from credit balances. A
  // client owning multiple deliverable_type rows shares a single tier per
  // the directional-pivot invariant; we dedupe in JS rather than relying
  // on Postgres distinct-on so the read stays simple.
  let balanceQuery = admin
    .from('client_credit_balances')
    .select('client_id, package_tier_id')
    .not('package_tier_id', 'is', null);

  if (forcedClientId) {
    balanceQuery = balanceQuery.eq('client_id', forcedClientId);
  }

  const { data: balanceRows, error: balanceErr } = await balanceQuery.returns<
    Array<{ client_id: string; package_tier_id: string | null }>
  >();
  if (balanceErr) {
    return NextResponse.json({ error: balanceErr.message }, { status: 500 });
  }

  const seen = new Set<string>();
  const activeClients: ActiveClient[] = [];
  for (const row of balanceRows ?? []) {
    if (!row.package_tier_id) continue;
    const key = `${row.client_id}::${row.package_tier_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    activeClients.push({
      client_id: row.client_id,
      package_tier_id: row.package_tier_id,
    });
  }

  if (activeClients.length === 0) {
    return NextResponse.json({
      success: true,
      month_start: monthStart,
      processed: 0,
      inserted: 0,
      results: [],
    });
  }

  // One read for every tier we'll touch this run.
  const tierIds = Array.from(new Set(activeClients.map((c) => c.package_tier_id)));
  const { data: allotmentRows, error: allotErr } = await admin
    .from('package_tier_allotments')
    .select('package_tier_id, deliverable_type_id, monthly_count')
    .in('package_tier_id', tierIds)
    .returns<AllotmentRow[]>();
  if (allotErr) {
    return NextResponse.json({ error: allotErr.message }, { status: 500 });
  }

  const allotmentsByTier = new Map<string, AllotmentRow[]>();
  for (const row of allotmentRows ?? []) {
    const bucket = allotmentsByTier.get(row.package_tier_id) ?? [];
    bucket.push(row);
    allotmentsByTier.set(row.package_tier_id, bucket);
  }

  type Result = {
    clientId: string;
    tierId: string;
    inserted: number;
    skipped: number;
    error?: string;
  };
  const results: Result[] = [];
  let totalInserted = 0;

  for (const c of activeClients) {
    const allotments = allotmentsByTier.get(c.package_tier_id) ?? [];
    if (allotments.length === 0) {
      results.push({
        clientId: c.client_id,
        tierId: c.package_tier_id,
        inserted: 0,
        skipped: 0,
        error: 'no_allotments_for_tier',
      });
      continue;
    }

    const rows: Array<{
      client_id: string;
      month_start: string;
      deliverable_type_id: string;
      slot_index: number;
    }> = [];
    for (const a of allotments) {
      for (let i = 1; i <= a.monthly_count; i += 1) {
        rows.push({
          client_id: c.client_id,
          month_start: monthStart,
          deliverable_type_id: a.deliverable_type_id,
          slot_index: i,
        });
      }
    }

    if (rows.length === 0) {
      results.push({ clientId: c.client_id, tierId: c.package_tier_id, inserted: 0, skipped: 0 });
      continue;
    }

    const { data: inserted, error: insertErr } = await admin
      .from('monthly_deliverable_slots')
      .upsert(rows, {
        onConflict: 'client_id,month_start,deliverable_type_id,slot_index',
        ignoreDuplicates: true,
      })
      .select('id');

    if (insertErr) {
      results.push({
        clientId: c.client_id,
        tierId: c.package_tier_id,
        inserted: 0,
        skipped: rows.length,
        error: insertErr.message,
      });
      continue;
    }

    const insertedCount = inserted?.length ?? 0;
    totalInserted += insertedCount;
    results.push({
      clientId: c.client_id,
      tierId: c.package_tier_id,
      inserted: insertedCount,
      skipped: rows.length - insertedCount,
    });
  }

  return NextResponse.json({
    success: true,
    month_start: monthStart,
    processed: activeClients.length,
    inserted: totalInserted,
    results,
  });
}

export const GET = withCronTelemetry(
  {
    route: '/api/cron/generate-monthly-slots',
    extractRowsProcessed: (body) => {
      const count = (body as { inserted?: number } | null)?.inserted;
      return typeof count === 'number' ? count : undefined;
    },
  },
  handleGet,
);
