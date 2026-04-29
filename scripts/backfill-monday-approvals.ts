/**
 * Backfill Monday "Client approved" status for content calendars whose
 * Cortex share link is fully approved but never made it to Monday.
 *
 * Why this exists: the comment route fired the Monday writeback as a bare
 * fire-and-forget — Vercel was killing the function after the response
 * before the Monday API call resolved. Result: chat 🎉 messages landed but
 * the Monday board stayed in "Waiting on approval". The route is now wrapped
 * in `after()`, so this is a one-shot to catch already-approved calendars up.
 *
 * For each content_drop with a share link:
 *   1. resolve the post_review_link_map → review_link_ids
 *   2. check that every review_link_id has at least one `status='approved'`
 *      comment in `post_review_comments`
 *   3. if so, find the matching Monday item (client name + month group)
 *   4. flip the Client Approval column to "Client approved"
 *
 * Idempotent — flipping a column that's already at the target label is a no-op.
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
import { isMondayConfigured } from '@/lib/monday/client';
import {
  APPROVAL_CLIENT_APPROVED,
  findContentCalendarItem,
  groupTitleForCalendarStart,
  setClientApprovalStatus,
} from '@/lib/monday/calendar-approval';

type ShareRow = {
  drop_id: string;
  post_review_link_map: Record<string, string> | null;
};

type DropRow = {
  id: string;
  start_date: string;
  client_id: string;
  clients: { name: string } | null;
};

const DRY_RUN = process.argv.includes('--dry-run');
const MONTH_FILTER = process.argv.find((a) => a.startsWith('--month='))?.slice('--month='.length);
// Default: only sync May 2026 calendars (the 16 calendars sent for client review).
const DEFAULT_START = '2026-05-01';
const DEFAULT_END = '2026-06-01';

async function main() {
  if (!isMondayConfigured()) {
    console.error('MONDAY_API_TOKEN not set — aborting.');
    process.exit(1);
  }

  const admin = createAdminClient();

  let startBound = DEFAULT_START;
  let endBound = DEFAULT_END;
  if (MONTH_FILTER) {
    const [y, m] = MONTH_FILTER.split('-').map(Number);
    if (!y || !m) {
      console.error(`Invalid --month=${MONTH_FILTER} (expected YYYY-MM)`);
      process.exit(1);
    }
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 1));
    startBound = start.toISOString().slice(0, 10);
    endBound = end.toISOString().slice(0, 10);
  }

  console.log(`\n=== Monday approval backfill ===`);
  console.log(`Window: ${startBound} → ${endBound}${DRY_RUN ? ' (dry run)' : ''}\n`);

  const { data: drops, error: dropErr } = await admin
    .from('content_drops')
    .select('id, start_date, client_id, clients!inner(name)')
    .gte('start_date', startBound)
    .lt('start_date', endBound)
    .returns<DropRow[]>();
  if (dropErr) {
    console.error('drop query error:', dropErr);
    process.exit(1);
  }

  const dropIds = (drops ?? []).map((d) => d.id);
  if (dropIds.length === 0) {
    console.log('No content_drops in window.');
    return;
  }

  const { data: shares } = await admin
    .from('content_drop_share_links')
    .select('drop_id, post_review_link_map')
    .in('drop_id', dropIds)
    .returns<ShareRow[]>();

  const shareByDrop = new Map<string, ShareRow>();
  for (const s of shares ?? []) shareByDrop.set(s.drop_id, s);

  // Collect every review_link_id we care about across all drops, then pull
  // approved comments in one shot.
  const allReviewLinkIds = new Set<string>();
  for (const s of shares ?? []) {
    for (const id of Object.values(s.post_review_link_map ?? {})) {
      allReviewLinkIds.add(id);
    }
  }

  let approvedSet = new Set<string>();
  if (allReviewLinkIds.size > 0) {
    const { data: approvals } = await admin
      .from('post_review_comments')
      .select('review_link_id')
      .in('review_link_id', Array.from(allReviewLinkIds))
      .eq('status', 'approved');
    approvedSet = new Set((approvals ?? []).map((a) => a.review_link_id));
  }

  let synced = 0;
  let skippedNotApproved = 0;
  let skippedNoShare = 0;
  let skippedNoMonday = 0;
  let errors = 0;

  for (const drop of drops ?? []) {
    const clientName = drop.clients?.name ?? '(unknown)';
    const share = shareByDrop.get(drop.id);
    if (!share || !share.post_review_link_map) {
      console.log(`⊘ ${clientName} — no share link`);
      skippedNoShare++;
      continue;
    }
    const reviewLinkIds = Object.values(share.post_review_link_map);
    if (reviewLinkIds.length === 0) {
      console.log(`⊘ ${clientName} — empty review_link_map`);
      skippedNoShare++;
      continue;
    }
    const allApproved = reviewLinkIds.every((id) => approvedSet.has(id));
    if (!allApproved) {
      const approvedCount = reviewLinkIds.filter((id) => approvedSet.has(id)).length;
      console.log(`⏳ ${clientName} — ${approvedCount}/${reviewLinkIds.length} approved`);
      skippedNotApproved++;
      continue;
    }

    const groupTitle = groupTitleForCalendarStart(drop.start_date);
    let item;
    try {
      item = await findContentCalendarItem(clientName, groupTitle);
    } catch (err) {
      console.error(`✗ ${clientName} — Monday lookup failed:`, err);
      errors++;
      continue;
    }
    if (!item) {
      console.log(`⊘ ${clientName} — no Monday item in group "${groupTitle}"`);
      skippedNoMonday++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`✓ ${clientName} → would set Monday ${item.itemId} = "${APPROVAL_CLIENT_APPROVED}"`);
      synced++;
      continue;
    }

    try {
      await setClientApprovalStatus(item.itemId, APPROVAL_CLIENT_APPROVED);
      console.log(`✓ ${clientName} → Monday ${item.itemId} = "${APPROVAL_CLIENT_APPROVED}"`);
      synced++;
    } catch (err) {
      console.error(`✗ ${clientName} — setClientApprovalStatus failed:`, err);
      errors++;
    }
  }

  console.log('\n— Summary —');
  console.log(`  synced:              ${synced}`);
  console.log(`  not fully approved:  ${skippedNotApproved}`);
  console.log(`  no share link:       ${skippedNoShare}`);
  console.log(`  not in Monday:       ${skippedNoMonday}`);
  console.log(`  errors:              ${errors}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
