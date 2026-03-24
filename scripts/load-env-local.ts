import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Load `.env.local` into `process.env` for Node scripts (same pattern as exec-sql-file).
 * Does not override existing env vars.
 */
export function loadEnvLocal(): boolean {
  const envPath = resolve(process.cwd(), '.env.local');
  if (!existsSync(envPath)) return false;
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
  return true;
}

export function getDatabaseUrl(): string | undefined {
  const u =
    process.env.SUPABASE_DB_URL?.trim() ||
    process.env.DIRECT_URL?.trim() ||
    process.env.DATABASE_URL?.trim();
  return u || undefined;
}
