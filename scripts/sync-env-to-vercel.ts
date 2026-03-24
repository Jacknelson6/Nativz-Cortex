/**
 * Push variables from .env.local to Vercel (default: production).
 *
 * Requires: linked project (`npx vercel link`) or VERCEL_ORG_ID + VERCEL_PROJECT_ID,
 * and a logged-in CLI (`npx vercel login`) or VERCEL_TOKEN.
 *
 * Usage:
 *   npx tsx scripts/sync-env-to-vercel.ts              # production only
 *   npx tsx scripts/sync-env-to-vercel.ts preview
 *   npx tsx scripts/sync-env-to-vercel.ts development
 *   VERCEL_SYNC_APP_URL=https://cortex.nativz.io npx tsx scripts/sync-env-to-vercel.ts
 *
 * Skips empty values and keys that are only for local tooling (see SKIP_KEYS).
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const ENV_FILE = resolve(ROOT, '.env.local');

/** Never send to Vercel — used only for local migrate / SQL scripts. */
const SKIP_KEYS = new Set(['SUPABASE_DB_URL']);

function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1);
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function main() {
  const target = (process.argv[2] ?? 'production').toLowerCase();
  if (!['production', 'preview', 'development'].includes(target)) {
    console.error(
      'Usage: npx tsx scripts/sync-env-to-vercel.ts [production|preview|development]',
    );
    process.exit(1);
  }

  if (!existsSync(ENV_FILE)) {
    console.error(`Missing ${ENV_FILE}`);
    process.exit(1);
  }

  const raw = parseEnvFile(readFileSync(ENV_FILE, 'utf8'));
  const prodAppUrl =
    process.env.VERCEL_SYNC_APP_URL?.trim() || 'https://cortex.nativz.io';

  const entries = Object.entries(raw).filter(([k, v]) => {
    if (SKIP_KEYS.has(k)) return false;
    if (v === '') return false;
    return true;
  });

  if (entries.length === 0) {
    console.error('No variables to sync (all skipped or empty).');
    process.exit(1);
  }

  console.log(`Syncing ${entries.length} variables to Vercel "${target}"...\n`);

  for (const [key, value] of entries) {
    let v = value;
    if (key === 'NEXT_PUBLIC_APP_URL' && target === 'production') {
      v = prodAppUrl;
      console.log(`  ${key} → (override for production) ${v}`);
    } else {
      console.log(`  ${key}`);
    }

    const sensitive = !key.startsWith('NEXT_PUBLIC_');
    const args = [
      'vercel',
      'env',
      'add',
      key,
      target,
      '--value',
      v,
      '--yes',
      '--force',
    ];
    if (sensitive) args.push('--sensitive');

    const r = spawnSync('npx', args, {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env },
    });

    if (r.status !== 0) {
      console.error(`\nFailed on ${key} (exit ${r.status ?? 'unknown'})`);
      process.exit(r.status ?? 1);
    }
  }

  console.log('\nDone. Redeploy so new values apply to running functions.');
}

main();
