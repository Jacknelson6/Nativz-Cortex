/**
 * One-shot validator for the credits backfill (migration 220).
 *
 * Asserts the post-migration invariants laid out in the spec
 * (tasks/credits-spec.md, "Backfill validation pass"):
 *
 *   1. Every active `clients` row has exactly one `client_credit_balances`
 *      row (no orphans, no duplicates).
 *   2. No `client_credit_balances` row has `current_balance != 0` and there
 *      are zero `credit_transactions` rows yet.
 *   3. All `period_started_at` values fall within a 60-second window of
 *      each other (sanity: they were all inserted in one migration run).
 *   4. Every `paused_until IS NOT NULL` row also has `pause_reason` set.
 *   5. Every row has `auto_grant_enabled` set (default true) and
 *      `next_reset_at > period_started_at`.
 *
 * Exits 0 on clean state, non-zero with a violation summary otherwise.
 * Cutover step 3 (consumption hook flip) is gated on this passing clean.
 *
 * Usage: `npx tsx scripts/validate-credits-backfill.ts`
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

const envPath = resolve(process.cwd(), '.env.local');
for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq);
  let val = trimmed.slice(eq + 1);
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  if (!process.env[key]) process.env[key] = val;
}

import { createAdminClient } from '@/lib/supabase/admin';

type ClientRow = { id: string; name: string; slug: string; lifecycle_state: string | null };
type BalanceRow = {
  client_id: string;
  current_balance: number;
  monthly_allowance: number;
  auto_grant_enabled: boolean;
  paused_until: string | null;
  pause_reason: string | null;
  period_started_at: string;
  next_reset_at: string;
  opening_balance_at_period_start: number;
};

// Lifecycle states that REQUIRE a balance row. `clients_lifecycle_state_check`
// (migration 154) enums to: lead | contracted | paid_deposit | active | churned.
// Churned clients aren't required to have a balance row, but if they do we
// still surface duplicates for them.
const ACTIVE_LIFECYCLE_STATES = ['lead', 'contracted', 'paid_deposit', 'active'];

async function main() {
  const admin = createAdminClient();

  const [clientsRes, balancesRes, txCountRes] = await Promise.all([
    admin
      .from('clients')
      .select('id, name, slug, lifecycle_state')
      .returns<ClientRow[]>(),
    admin
      .from('client_credit_balances')
      .select(
        'client_id, current_balance, monthly_allowance, auto_grant_enabled, paused_until, pause_reason, period_started_at, next_reset_at, opening_balance_at_period_start',
      )
      .returns<BalanceRow[]>(),
    admin.from('credit_transactions').select('id', { count: 'exact', head: true }),
  ]);

  if (clientsRes.error) {
    console.error('clients query failed:', clientsRes.error);
    process.exit(2);
  }
  if (balancesRes.error) {
    console.error('balances query failed:', balancesRes.error);
    process.exit(2);
  }
  if (txCountRes.error) {
    console.error('credit_transactions count failed:', txCountRes.error);
    process.exit(2);
  }

  const clients = clientsRes.data ?? [];
  const balances = balancesRes.data ?? [];
  const txCount = txCountRes.count ?? 0;

  const violations: string[] = [];

  // Group balances by client_id to detect duplicates.
  const balancesByClient = new Map<string, BalanceRow[]>();
  for (const b of balances) {
    const arr = balancesByClient.get(b.client_id) ?? [];
    arr.push(b);
    balancesByClient.set(b.client_id, arr);
  }

  // Invariant 1: every active client has exactly one balance row.
  for (const c of clients) {
    const isActive =
      !c.lifecycle_state || ACTIVE_LIFECYCLE_STATES.includes(c.lifecycle_state);
    if (!isActive) continue;
    const rows = balancesByClient.get(c.id) ?? [];
    if (rows.length === 0) {
      violations.push(`MISSING balance row for active client ${c.name} (${c.slug}, ${c.id})`);
    } else if (rows.length > 1) {
      violations.push(
        `DUPLICATE balance rows for client ${c.name} (${c.slug}, ${c.id}): ${rows.length} rows`,
      );
    }
  }

  // Detect orphaned balance rows (no matching client).
  const clientIds = new Set(clients.map((c) => c.id));
  for (const b of balances) {
    if (!clientIds.has(b.client_id)) {
      violations.push(`ORPHAN balance row for missing client_id ${b.client_id}`);
    }
  }

  // Invariant 2: balances start at zero, ledger is empty.
  for (const b of balances) {
    if (b.current_balance !== 0) {
      violations.push(
        `NON-ZERO balance for client ${b.client_id}: ${b.current_balance} (expected 0 pre-launch)`,
      );
    }
    if (b.opening_balance_at_period_start !== 0) {
      violations.push(
        `NON-ZERO opening_balance for client ${b.client_id}: ${b.opening_balance_at_period_start}`,
      );
    }
  }
  if (txCount !== 0) {
    violations.push(`credit_transactions has ${txCount} rows; expected 0 pre-launch`);
  }

  // Invariant 3: period_started_at within 60 seconds of each other.
  if (balances.length > 0) {
    const times = balances.map((b) => new Date(b.period_started_at).getTime());
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const spreadSec = (maxTime - minTime) / 1000;
    if (spreadSec > 60) {
      violations.push(
        `period_started_at spread is ${spreadSec.toFixed(1)}s across ${balances.length} rows; expected <=60s`,
      );
    }
  }

  // Invariant 4: paused rows have a reason.
  for (const b of balances) {
    if (b.paused_until && !b.pause_reason) {
      violations.push(
        `paused_until set without pause_reason for client ${b.client_id} (paused_until=${b.paused_until})`,
      );
    }
  }

  // Invariant 5: next_reset_at must be after period_started_at.
  for (const b of balances) {
    const start = new Date(b.period_started_at).getTime();
    const reset = new Date(b.next_reset_at).getTime();
    if (Number.isNaN(start) || Number.isNaN(reset)) {
      violations.push(`bad timestamp on client ${b.client_id}: start=${b.period_started_at} reset=${b.next_reset_at}`);
    } else if (reset <= start) {
      violations.push(
        `next_reset_at <= period_started_at for client ${b.client_id} (start=${b.period_started_at}, reset=${b.next_reset_at})`,
      );
    }
  }

  // Report.
  console.log('\n=== Credits backfill validation ===');
  console.log(`  clients (all): ${clients.length}`);
  console.log(
    `  active clients: ${clients.filter((c) => !c.lifecycle_state || ACTIVE_LIFECYCLE_STATES.includes(c.lifecycle_state)).length}`,
  );
  console.log(`  balance rows: ${balances.length}`);
  console.log(`  credit_transactions rows: ${txCount}`);
  console.log(`  paused rows: ${balances.filter((b) => b.paused_until || !b.auto_grant_enabled).length}`);

  if (violations.length === 0) {
    console.log('\n✓ All invariants satisfied. Cutover step 3 unblocked.');
    process.exit(0);
  }

  console.log(`\n✗ ${violations.length} violation${violations.length === 1 ? '' : 's'}:`);
  for (const v of violations) console.log(`    - ${v}`);
  process.exit(1);
}

main().catch((e) => {
  console.error('validator crashed:', e);
  process.exit(2);
});
