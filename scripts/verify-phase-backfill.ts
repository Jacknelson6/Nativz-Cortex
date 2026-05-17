/**
 * Verify migration 322's phase backfill.
 *
 * Reads every editing_projects row, recomputes what the phase SHOULD be
 * from the legacy status + side data (drive_folder_url presence, video
 * count, share-link presence, promoted_at, scheduled_posts), and reports
 * any rows where the stored phase doesn't match the derived value.
 *
 * Dry run by default — prints a punch list. Pass --fix to apply
 * corrective writes.
 *
 * Usage:
 *   npx tsx scripts/verify-phase-backfill.ts
 *   npx tsx scripts/verify-phase-backfill.ts --fix
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import type { EditingProjectPhase } from '../lib/editing/types';

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

interface ProjectRow {
  id: string;
  name: string;
  status: string;
  phase: EditingProjectPhase | null;
  drive_folder_url: string | null;
  raws_uploaded_at: string | null;
  promoted_at: string | null;
  approved_at: string | null;
}

/**
 * Derive the expected phase from observable facts. Mirrors the logic in
 * migration 322's backfill so the verifier acts as a permanent oracle.
 */
function derivePhase(row: ProjectRow, facts: {
  hasVideos: boolean;
  hasShareLink: boolean;
  hasScheduledPost: boolean;
}): EditingProjectPhase {
  if (row.status === 'archived') return 'Done';
  if (row.status === 'done') return 'Done';
  if (facts.hasScheduledPost) return 'Publishing';
  if (row.status === 'approved') return 'Approved';
  if (row.approved_at) return 'Approved';
  if (facts.hasShareLink || row.status === 'need_approval' || row.status === 'revising') {
    return 'Client review';
  }
  if (facts.hasVideos) return 'Editing';
  if (row.raws_uploaded_at || row.drive_folder_url) return 'Raw uploaded';
  return 'Planning';
}

async function main() {
  console.log(`[verify-phase] mode=${apply ? 'fix' : 'dry-run'}`);

  const { data: rows, error } = await supabase
    .from('editing_projects')
    .select('id, name, status, phase, drive_folder_url, raws_uploaded_at, promoted_at, approved_at')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[verify-phase] read failed:', error.message);
    process.exit(1);
  }
  if (!rows) {
    console.log('[verify-phase] no rows');
    return;
  }

  // Pull video / share / scheduled-post counts in batches.
  const ids = rows.map((r) => r.id);
  const [{ data: videos }, { data: shareLinks }, { data: scheduled }] = await Promise.all([
    supabase
      .from('editing_project_videos')
      .select('project_id')
      .in('project_id', ids),
    supabase
      .from('editing_share_links')
      .select('project_id, revoked')
      .in('project_id', ids),
    supabase
      .from('scheduled_posts')
      .select('editing_project_id')
      .in('editing_project_id', ids),
  ]);

  const hasVideos = new Set<string>();
  for (const v of videos ?? []) hasVideos.add(v.project_id as string);
  const hasShareLink = new Set<string>();
  for (const l of shareLinks ?? []) {
    if (!(l as { revoked?: boolean }).revoked) hasShareLink.add(l.project_id as string);
  }
  const hasScheduledPost = new Set<string>();
  for (const s of scheduled ?? []) {
    hasScheduledPost.add((s as { editing_project_id: string }).editing_project_id);
  }

  let drift = 0;
  let fixed = 0;
  for (const row of rows as ProjectRow[]) {
    const expected = derivePhase(row, {
      hasVideos: hasVideos.has(row.id),
      hasShareLink: hasShareLink.has(row.id),
      hasScheduledPost: hasScheduledPost.has(row.id),
    });
    if (row.phase === expected) continue;
    drift += 1;
    console.log(
      `  drift: ${row.id} "${row.name}" status=${row.status} stored=${row.phase ?? '(null)'} expected=${expected}`,
    );
    if (apply) {
      const { error: upErr } = await supabase
        .from('editing_projects')
        .update({ phase: expected })
        .eq('id', row.id);
      if (upErr) {
        console.error(`  fix failed for ${row.id}: ${upErr.message}`);
      } else {
        fixed += 1;
      }
    }
  }

  console.log(`[verify-phase] total=${rows.length} drift=${drift} fixed=${fixed}`);
}

main().catch((err) => {
  console.error('[verify-phase] threw:', err);
  process.exit(1);
});
