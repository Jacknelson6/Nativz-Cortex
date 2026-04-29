/**
 * Quick read-only smoke test for `syncMondayApprovalForDrop` after the
 * Monday-on-notify wiring. Computes the label that *would* be pushed for
 * the most recent share link of a given client without actually mutating
 * Monday — so we can confirm the new "anyRevised && anyNotifyPending"
 * gating resolves to the right label.
 *
 * Usage:
 *   npx tsx scripts/test-monday-approval-sync.ts                  # dry-run, default Safestop
 *   APPLY=1 npx tsx scripts/test-monday-approval-sync.ts          # also push to Monday
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
import {
  computeApprovalLabel,
  syncMondayApprovalForDrop,
} from '@/lib/monday/calendar-approval';

const TARGET_CLIENT = process.argv.includes('--client')
  ? process.argv[process.argv.indexOf('--client') + 1]
  : 'Safestop';
const APPLY = process.env.APPLY === '1';

async function main() {
  const admin = createAdminClient();

  const { data: clients } = await admin
    .from('clients')
    .select('id, name')
    .ilike('name', `%${TARGET_CLIENT}%`)
    .limit(1)
    .returns<Array<{ id: string; name: string }>>();
  const client = clients?.[0];
  if (!client) {
    console.error(`No client matching "${TARGET_CLIENT}"`);
    process.exit(1);
  }

  const { data: drops } = await admin
    .from('content_drops')
    .select('id, start_date')
    .eq('client_id', client.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .returns<Array<{ id: string; start_date: string }>>();
  const drop = drops?.[0];
  if (!drop) {
    console.error(`No content drop for client ${client.name}`);
    process.exit(1);
  }

  const { count: notifyPending } = await admin
    .from('content_drop_videos')
    .select('id', { count: 'exact', head: true })
    .eq('drop_id', drop.id)
    .eq('revised_video_notify_pending', true);

  console.log(`Client: ${client.name}`);
  console.log(`Drop:   ${drop.id}  start=${drop.start_date}`);
  console.log(`Pending notifies: ${notifyPending ?? 0}`);

  const computed = await computeApprovalLabel(admin, drop.id);
  console.log(`Computed Monday label → ${computed ?? '(no share link yet)'}`);

  if (APPLY) {
    console.log('APPLY=1 → pushing to Monday…');
    const result = await syncMondayApprovalForDrop(admin, drop.id);
    if (result) {
      console.log(`✓ Pushed label "${result.label}" to item ${result.itemId}`);
    } else {
      console.log('Sync skipped (no item or no share link).');
    }
  } else {
    console.log('Dry run. Re-run with APPLY=1 to push to Monday.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
