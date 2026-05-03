/**
 * One-time setter for per-client monthly credit allowance.
 *
 * Cutover step 2: per active client, set `monthly_allowance` to the
 * contracted number of approved videos per month. Per inactive/churned
 * client, flip `auto_grant_enabled = false` with a `pause_reason`.
 *
 * Modes:
 *
 *   --list
 *     Dump every client's current allowance + pause state, sorted by name.
 *     Read-only. Run this first to see what's set.
 *
 *   --apply <path-to-json>
 *     Apply a JSON map of slug → config. Schema:
 *
 *       {
 *         "acme-co": { "monthly_allowance": 8, "rollover_policy": "none" },
 *         "beta-llc": {
 *           "monthly_allowance": 12,
 *           "rollover_policy": "cap",
 *           "rollover_cap": 24
 *         },
 *         "churned-co": {
 *           "auto_grant_enabled": false,
 *           "pause_reason": "Churned 2026-03"
 *         }
 *       }
 *
 *     Validates each row client-side (allowance >=0, rollover_cap required
 *     when policy='cap'), shows a diff against current state, prompts for
 *     confirmation, then runs all updates inside a single SQL block.
 *
 *   --dry-run (combined with --apply)
 *     Show the diff but do nothing.
 *
 * Usage:
 *   npx tsx scripts/seed-client-allowances.ts --list
 *   npx tsx scripts/seed-client-allowances.ts --apply config/allowances.json --dry-run
 *   npx tsx scripts/seed-client-allowances.ts --apply config/allowances.json
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createInterface } from 'readline';

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

type RolloverPolicy = 'none' | 'cap' | 'unlimited';

type Config = {
  monthly_allowance?: number;
  rollover_policy?: RolloverPolicy;
  rollover_cap?: number | null;
  auto_grant_enabled?: boolean;
  paused_until?: string | null;
  pause_reason?: string | null;
};

type ClientRow = {
  id: string;
  name: string;
  slug: string;
  lifecycle_state: string | null;
};

type BalanceRow = {
  client_id: string;
  current_balance: number;
  monthly_allowance: number;
  rollover_policy: RolloverPolicy;
  rollover_cap: number | null;
  auto_grant_enabled: boolean;
  paused_until: string | null;
  pause_reason: string | null;
};

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(question, (a) => { rl.close(); res(a); }));
}

function validateConfig(slug: string, cfg: unknown): { ok: true; cfg: Config } | { ok: false; error: string } {
  if (!cfg || typeof cfg !== 'object') {
    return { ok: false, error: `${slug}: config must be an object` };
  }
  const c = cfg as Record<string, unknown>;
  const out: Config = {};

  if ('monthly_allowance' in c) {
    if (typeof c.monthly_allowance !== 'number' || !Number.isInteger(c.monthly_allowance) || c.monthly_allowance < 0 || c.monthly_allowance > 10_000) {
      return { ok: false, error: `${slug}: monthly_allowance must be an integer 0..10000` };
    }
    out.monthly_allowance = c.monthly_allowance;
  }
  if ('rollover_policy' in c) {
    if (c.rollover_policy !== 'none' && c.rollover_policy !== 'cap' && c.rollover_policy !== 'unlimited') {
      return { ok: false, error: `${slug}: rollover_policy must be none|cap|unlimited` };
    }
    out.rollover_policy = c.rollover_policy;
  }
  if ('rollover_cap' in c) {
    if (c.rollover_cap !== null && (typeof c.rollover_cap !== 'number' || !Number.isInteger(c.rollover_cap) || c.rollover_cap < 0)) {
      return { ok: false, error: `${slug}: rollover_cap must be a non-negative integer or null` };
    }
    out.rollover_cap = c.rollover_cap as number | null;
  }
  if (out.rollover_policy === 'cap' && (out.rollover_cap == null || out.rollover_cap < 0)) {
    return { ok: false, error: `${slug}: rollover_cap is required when rollover_policy='cap'` };
  }
  if ('auto_grant_enabled' in c) {
    if (typeof c.auto_grant_enabled !== 'boolean') {
      return { ok: false, error: `${slug}: auto_grant_enabled must be boolean` };
    }
    out.auto_grant_enabled = c.auto_grant_enabled;
  }
  if ('paused_until' in c) {
    if (c.paused_until !== null && typeof c.paused_until !== 'string') {
      return { ok: false, error: `${slug}: paused_until must be ISO string or null` };
    }
    out.paused_until = c.paused_until as string | null;
  }
  if ('pause_reason' in c) {
    if (c.pause_reason !== null && typeof c.pause_reason !== 'string') {
      return { ok: false, error: `${slug}: pause_reason must be string or null` };
    }
    out.pause_reason = c.pause_reason as string | null;
  }
  // Pause checks: paused_until OR auto_grant_enabled=false requires reason.
  const pausing =
    out.paused_until != null || out.auto_grant_enabled === false;
  if (pausing && !out.pause_reason) {
    return { ok: false, error: `${slug}: pause_reason required when pausing` };
  }
  return { ok: true, cfg: out };
}

function pauseStateLabel(b: BalanceRow): string {
  if (!b.auto_grant_enabled) return `paused (indefinite, "${b.pause_reason ?? '?'}")`;
  if (b.paused_until && new Date(b.paused_until).getTime() > Date.now()) {
    return `paused until ${b.paused_until.slice(0, 10)} ("${b.pause_reason ?? '?'}")`;
  }
  return 'active';
}

async function listMode() {
  const admin = createAdminClient();
  const [{ data: clients }, { data: balances }] = await Promise.all([
    admin
      .from('clients')
      .select('id, name, slug, lifecycle_state')
      .order('name')
      .returns<ClientRow[]>(),
    admin
      .from('client_credit_balances')
      .select(
        'client_id, current_balance, monthly_allowance, rollover_policy, rollover_cap, auto_grant_enabled, paused_until, pause_reason',
      )
      .returns<BalanceRow[]>(),
  ]);

  const byClient = new Map<string, BalanceRow>();
  for (const b of balances ?? []) byClient.set(b.client_id, b);

  console.log('\n=== Client allowance state ===\n');
  console.log(
    'slug'.padEnd(28) +
      'name'.padEnd(32) +
      'lifecycle'.padEnd(12) +
      'allow'.padEnd(7) +
      'rollover'.padEnd(14) +
      'balance'.padEnd(9) +
      'state',
  );
  console.log('-'.repeat(120));
  for (const c of clients ?? []) {
    const b = byClient.get(c.id);
    if (!b) {
      console.log(
        c.slug.padEnd(28) +
          c.name.slice(0, 30).padEnd(32) +
          (c.lifecycle_state ?? '-').padEnd(12) +
          '?'.padEnd(7) +
          '?'.padEnd(14) +
          '?'.padEnd(9) +
          'NO BALANCE ROW',
      );
      continue;
    }
    const rolloverLabel =
      b.rollover_policy === 'cap'
        ? `cap(${b.rollover_cap ?? '?'})`
        : b.rollover_policy;
    console.log(
      c.slug.padEnd(28) +
        c.name.slice(0, 30).padEnd(32) +
        (c.lifecycle_state ?? '-').padEnd(12) +
        String(b.monthly_allowance).padEnd(7) +
        rolloverLabel.padEnd(14) +
        String(b.current_balance).padEnd(9) +
        pauseStateLabel(b),
    );
  }
  console.log(`\n${(clients ?? []).length} client${(clients ?? []).length === 1 ? '' : 's'} total.`);
}

async function applyMode(configPath: string, dryRun: boolean) {
  const admin = createAdminClient();
  const raw = readFileSync(resolve(process.cwd(), configPath), 'utf-8');
  const parsed = JSON.parse(raw) as Record<string, unknown>;

  // Validate every entry up front. Fail fast with all errors collected.
  const validated: Array<{ slug: string; cfg: Config }> = [];
  const validationErrors: string[] = [];
  for (const [slug, cfg] of Object.entries(parsed)) {
    const v = validateConfig(slug, cfg);
    if (v.ok) validated.push({ slug, cfg: v.cfg });
    else validationErrors.push(v.error);
  }
  if (validationErrors.length) {
    console.error('Config validation failed:');
    for (const e of validationErrors) console.error(`  - ${e}`);
    process.exit(1);
  }

  // Resolve slugs to client_ids.
  const slugs = validated.map((v) => v.slug);
  const { data: clients, error: clientsErr } = await admin
    .from('clients')
    .select('id, name, slug')
    .in('slug', slugs)
    .returns<Array<{ id: string; name: string; slug: string }>>();
  if (clientsErr) {
    console.error('failed to load clients:', clientsErr);
    process.exit(2);
  }
  const slugToClient = new Map((clients ?? []).map((c) => [c.slug, c]));

  const missing = slugs.filter((s) => !slugToClient.has(s));
  if (missing.length) {
    console.error('Unknown slugs in config:');
    for (const s of missing) console.error(`  - ${s}`);
    process.exit(1);
  }

  const clientIds = (clients ?? []).map((c) => c.id);
  const { data: balances } = await admin
    .from('client_credit_balances')
    .select(
      'client_id, current_balance, monthly_allowance, rollover_policy, rollover_cap, auto_grant_enabled, paused_until, pause_reason',
    )
    .in('client_id', clientIds)
    .returns<BalanceRow[]>();
  const byClient = new Map((balances ?? []).map((b) => [b.client_id, b]));

  // Build the diff.
  console.log('\n=== Allowance diff ===\n');
  const updates: Array<{ slug: string; clientId: string; patch: Record<string, unknown> }> = [];
  for (const { slug, cfg } of validated) {
    const client = slugToClient.get(slug)!;
    const b = byClient.get(client.id);
    if (!b) {
      console.log(`✗ ${slug}: NO BALANCE ROW (skipped)`);
      continue;
    }
    const patch: Record<string, unknown> = {};
    const lines: string[] = [];

    if (cfg.monthly_allowance !== undefined && cfg.monthly_allowance !== b.monthly_allowance) {
      patch.monthly_allowance = cfg.monthly_allowance;
      lines.push(`allowance ${b.monthly_allowance} → ${cfg.monthly_allowance}`);
    }
    if (cfg.rollover_policy !== undefined && cfg.rollover_policy !== b.rollover_policy) {
      patch.rollover_policy = cfg.rollover_policy;
      lines.push(`rollover_policy ${b.rollover_policy} → ${cfg.rollover_policy}`);
    }
    // rollover_cap: null when policy != 'cap', else the value.
    const targetPolicy = cfg.rollover_policy ?? b.rollover_policy;
    const targetCap = targetPolicy === 'cap' ? (cfg.rollover_cap ?? b.rollover_cap) : null;
    if (targetCap !== b.rollover_cap) {
      patch.rollover_cap = targetCap;
      lines.push(`rollover_cap ${b.rollover_cap ?? '∅'} → ${targetCap ?? '∅'}`);
    }
    if (cfg.auto_grant_enabled !== undefined && cfg.auto_grant_enabled !== b.auto_grant_enabled) {
      patch.auto_grant_enabled = cfg.auto_grant_enabled;
      lines.push(`auto_grant_enabled ${b.auto_grant_enabled} → ${cfg.auto_grant_enabled}`);
    }
    if (cfg.paused_until !== undefined && cfg.paused_until !== b.paused_until) {
      patch.paused_until = cfg.paused_until;
      lines.push(`paused_until ${b.paused_until ?? '∅'} → ${cfg.paused_until ?? '∅'}`);
    }
    if (cfg.pause_reason !== undefined && cfg.pause_reason !== b.pause_reason) {
      patch.pause_reason = cfg.pause_reason;
      lines.push(`pause_reason "${b.pause_reason ?? ''}" → "${cfg.pause_reason ?? ''}"`);
    }

    if (Object.keys(patch).length === 0) {
      console.log(`= ${slug} (${client.name}): no change`);
      continue;
    }
    patch.updated_at = new Date().toISOString();
    updates.push({ slug, clientId: client.id, patch });
    console.log(`~ ${slug} (${client.name}):`);
    for (const l of lines) console.log(`    ${l}`);
  }

  if (updates.length === 0) {
    console.log('\nNothing to apply.');
    return;
  }

  console.log(`\n${updates.length} client${updates.length === 1 ? '' : 's'} will be updated.`);
  if (dryRun) {
    console.log('--dry-run set: no writes.');
    return;
  }

  const ans = await prompt('Apply? [y/N] ');
  if (ans.trim().toLowerCase() !== 'y') {
    console.log('Aborted.');
    return;
  }

  let ok = 0;
  let failed = 0;
  for (const u of updates) {
    const { error } = await admin
      .from('client_credit_balances')
      .update(u.patch)
      .eq('client_id', u.clientId);
    if (error) {
      console.error(`  ✗ ${u.slug}: ${error.message}`);
      failed++;
    } else {
      console.log(`  ✓ ${u.slug}`);
      ok++;
    }
  }
  console.log(`\nApplied ${ok}/${updates.length}, failed ${failed}.`);
  if (failed > 0) process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--list')) {
    await listMode();
    return;
  }
  const applyIdx = args.indexOf('--apply');
  if (applyIdx >= 0) {
    const path = args[applyIdx + 1];
    if (!path) {
      console.error('--apply requires a path to a JSON config');
      process.exit(1);
    }
    await applyMode(path, args.includes('--dry-run'));
    return;
  }
  console.log(
    'Usage:\n  npx tsx scripts/seed-client-allowances.ts --list\n  npx tsx scripts/seed-client-allowances.ts --apply <path.json> [--dry-run]',
  );
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
