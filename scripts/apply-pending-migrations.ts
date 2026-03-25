/**
 * Apply SQL files under supabase/migrations/ that are not yet recorded in schema_migrations.
 *
 * Requires SUPABASE_DB_URL (or DIRECT_URL / DATABASE_URL) in .env.local — same as exec-sql-file.
 *
 * By default only files with numeric prefix >= 065 run (older migrations assumed already on the DB).
 * Greenfield: SUPABASE_MIGRATE_FROM=1 npm run supabase:migrate
 *
 * Usage:
 *   npx tsx scripts/apply-pending-migrations.ts
 *   npm run supabase:migrate
 */

import { readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';
import pg from 'pg';
import { getDatabaseUrl, loadEnvLocal } from './load-env-local';

const MIGRATIONS_DIR = resolve(process.cwd(), 'supabase/migrations');

const DEFAULT_MIN_SERIAL = 65;

function migrationSerial(filename: string): number | null {
  const m = /^(\d{3})_/.exec(filename);
  return m ? parseInt(m[1], 10) : null;
}

function minSerialFromEnv(): number {
  const raw = process.env.SUPABASE_MIGRATE_FROM?.trim();
  if (!raw) return DEFAULT_MIN_SERIAL;
  const n = parseInt(raw.replace(/\D/g, '') || '0', 10);
  return n > 0 ? n : DEFAULT_MIN_SERIAL;
}

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
`;

async function main() {
  if (!loadEnvLocal()) {
    console.log('[supabase:migrate] No .env.local — skip (Next.js may still load env for the app).');
    process.exit(0);
  }

  const url = getDatabaseUrl();
  if (!url) {
    console.log(
      '[supabase:migrate] No SUPABASE_DB_URL / DIRECT_URL / DATABASE_URL — skip. Add URI in .env.local to auto-apply migrations on dev.',
    );
    process.exit(0);
  }

  const minSerial = minSerialFromEnv();
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => {
      if (!f.endsWith('.sql') || f === '999_combined_all.sql') return false;
      const s = migrationSerial(f);
      return s !== null && s >= minSerial;
    })
    .sort();

  if (files.length === 0) {
    console.log('[supabase:migrate] No eligible migration files (min serial ' + minSerial + ').');
    process.exit(0);
  }

  const client = new pg.Client({
    connectionString: url,
    ssl: url.includes('supabase') ? { rejectUnauthorized: false } : undefined,
  });

  try {
    await client.connect();
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { code?: string };
    const transient = new Set(['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'ENETUNREACH']);
    if (err?.code && transient.has(err.code)) {
      console.warn(
        `[supabase:migrate] Database unreachable (${err.code}) — skip migrations. ` +
          'Check SUPABASE_DB_URL / DIRECT_URL in .env.local (Supabase Dashboard → Database → URI), VPN/network, or resume a paused project.',
      );
      process.exit(0);
    }
    throw e;
  }

  try {
    await client.query(INIT_SQL);

    const { rows: appliedRows } = await client.query<{ filename: string }>(
      'SELECT filename FROM schema_migrations',
    );
    const applied = new Set(appliedRows.map((r) => r.filename));

    let ran = 0;
    for (const name of files) {
      if (applied.has(name)) continue;

      const fullPath = resolve(MIGRATIONS_DIR, name);
      const sql = readFileSync(fullPath, 'utf-8');

      console.log('[supabase:migrate] Applying', name, '…');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [name]);
        await client.query('COMMIT');
        ran += 1;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    }

    if (ran === 0) {
      console.log('[supabase:migrate] Already up to date (' + files.length + ' files tracked).');
    } else {
      console.log('[supabase:migrate] Applied', ran, 'migration(s).');
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error('[supabase:migrate] Failed:', e);
  process.exit(1);
});
