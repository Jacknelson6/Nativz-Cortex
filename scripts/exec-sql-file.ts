/**
 * Run a .sql file against Postgres (e.g. Supabase).
 *
 * Add to .env.local (from Supabase → Project Settings → Database → Connection string → URI):
 *   SUPABASE_DB_URL=postgresql://postgres.[ref]:[YOUR-PASSWORD]@aws-0-....pooler.supabase.com:6543/postgres
 *
 * Usage:
 *   npx tsx scripts/exec-sql-file.ts supabase/migrations/053_kandy_templates_vertical_expand.sql
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import pg from 'pg';

const envPath = resolve(process.cwd(), '.env.local');
if (!existsSync(envPath)) {
  console.error('Missing .env.local');
  process.exit(1);
}
for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx);
  let val = trimmed.slice(eqIdx + 1);
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  if (!process.env[key]) process.env[key] = val;
}

const url =
  process.env.SUPABASE_DB_URL?.trim() ||
  process.env.DIRECT_URL?.trim() ||
  process.env.DATABASE_URL?.trim();

const fileArg = process.argv[2];
if (!fileArg) {
  console.error('Usage: npx tsx scripts/exec-sql-file.ts <path-to.sql>');
  process.exit(1);
}

if (!url) {
  console.error(
    'Missing database URL. Set SUPABASE_DB_URL in .env.local (Supabase Dashboard → Database → Connection string).'
  );
  process.exit(1);
}

const file = resolve(process.cwd(), fileArg);
const sql = readFileSync(file, 'utf-8');

async function main() {
  const client = new pg.Client({
    connectionString: url,
    ssl: url.includes('supabase') ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
  console.log('Applied:', file);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
