/**
 * Run a .sql file against Postgres (e.g. Supabase).
 *
 * Add to .env.local (from Supabase → Project Settings → Database → Connection string → URI):
 *   SUPABASE_DB_URL=postgresql://postgres.[ref]:[YOUR-PASSWORD]@aws-0-....pooler.supabase.com:6543/postgres
 *
 * Usage:
 *   npx tsx scripts/exec-sql-file.ts supabase/migrations/053_kandy_templates_vertical_expand.sql
 *
 * For normal workflow, prefer `npm run supabase:migrate` (applies pending files automatically).
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import pg from 'pg';
import { getDatabaseUrl, loadEnvLocal } from './load-env-local';

if (!loadEnvLocal()) {
  console.error('Missing .env.local');
  process.exit(1);
}

const url = getDatabaseUrl();

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
