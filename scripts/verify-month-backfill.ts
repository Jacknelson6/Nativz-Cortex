/**
 * Verify migration 322's content_month backfill.
 *
 * Mirrors the migration's CASE: prefer the earliest scheduled_post
 * tied to the project (via scheduled_posts.editing_project_id); fall
 * back to the project's created_at month. Reports drift and (with
 * --fix) applies corrective writes.
 *
 * Usage:
 *   npx tsx scripts/verify-month-backfill.ts
 *   npx tsx scripts/verify-month-backfill.ts --fix
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

const envPath = resolve(__dirname, '..', '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const env: Record<string, string> = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

const apply = process.argv.includes('--fix');

function firstOfMonth(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  // Use UTC slicing to match the postgres-side date_trunc('month', ...) semantics.
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

async function main() {
  console.log(`[verify-month] mode=${apply ? 'fix' : 'dry-run'}`);

  const { data: rows, error } = await supabase
    .from('editing_projects')
    .select('id, name, content_month, created_at')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[verify-month] read failed:', error.message);
    process.exit(1);
  }
  if (!rows) return;

  const ids = rows.map((r) => r.id as string);
  const { data: posts, error: postsErr } = await supabase
    .from('scheduled_posts')
    .select('editing_project_id, scheduled_at')
    .in('editing_project_id', ids);
  if (postsErr) {
    console.error('[verify-month] scheduled_posts read failed:', postsErr.message);
    process.exit(1);
  }

  // Earliest scheduled_at per project_id.
  const earliestByProject = new Map<string, string>();
  for (const row of posts ?? []) {
    const pid = (row as { editing_project_id: string | null }).editing_project_id;
    const ts = (row as { scheduled_at: string | null }).scheduled_at;
    if (!pid || !ts) continue;
    const existing = earliestByProject.get(pid);
    if (!existing || ts < existing) earliestByProject.set(pid, ts);
  }

  let drift = 0;
  let fixed = 0;
  for (const row of rows) {
    const earliest = earliestByProject.get(row.id as string) ?? null;
    const expected = firstOfMonth(earliest) ?? firstOfMonth(row.created_at as string | null);
    if (row.content_month === expected) continue;
    drift += 1;
    console.log(
      `  drift: ${row.id} "${row.name}" stored=${row.content_month ?? '(null)'} expected=${expected ?? '(null)'}`,
    );
    if (apply && expected) {
      const { error: upErr } = await supabase
        .from('editing_projects')
        .update({ content_month: expected })
        .eq('id', row.id);
      if (upErr) {
        console.error(`  fix failed for ${row.id}: ${upErr.message}`);
      } else {
        fixed += 1;
      }
    }
  }

  console.log(`[verify-month] total=${rows.length} drift=${drift} fixed=${fixed}`);
}

main().catch((err) => {
  console.error('[verify-month] threw:', err);
  process.exit(1);
});
