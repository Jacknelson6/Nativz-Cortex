/**
 * Skibell-specific scheduler for May 2026.
 *
 * Two drops, run end-to-end (Drive → ingest → analyze → caption → schedule):
 *   1. NEW drop  → IG/TikTok/YouTube/Facebook, mints public share link, drafts
 *                  until client approves each post on the share link.
 *   2. OLD drop  → IG/TikTok/YouTube only, NO share link, scheduled directly
 *                  on Zernio (these are approved-but-missed posts from last
 *                  month — already client-approved, just need to ship).
 *
 * Date logic:
 *   - New videos spread evenly across all 31 days of May 2026.
 *   - Old videos fill the off-days (May days NOT used by new), also evenly
 *     spread within those off-days.
 *   - Every slot is 12:00 America/Chicago (DST handled by Intl).
 *
 * Run:
 *   npx tsx scripts/schedule-skibell.ts                 # dry-run plan only
 *   npx tsx scripts/schedule-skibell.ts --apply         # full pipeline + Zernio
 *   QUEUE_USER_EMAIL=jack@nativz.io npx tsx scripts/schedule-skibell.ts --apply
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createAdminClient } from '@/lib/supabase/admin';
import { listVideosInFolder } from '@/lib/calendar/drive-folder';
import { runCalendarPipeline, eachDay, pickEven } from '@/lib/calendar/run-pipeline';
import { findRowByName, getMondayToken, setLaterCalendarLink, setStatusScheduled } from '@/lib/monday/calendars-board';
import type { SocialPlatform } from '@/lib/posting';

const MONDAY_ROW_NAME = 'Skibell Fine Jewelry';

const CLIENT_SLUG = 'skibell-fine-jewelry';
const USER_EMAIL = (process.env.QUEUE_USER_EMAIL ?? 'jack@nativz.io').toLowerCase();
const APP_URL = process.env.QUEUE_APP_URL ?? 'http://localhost:3001';

const OLD_FOLDER = 'https://drive.google.com/drive/folders/164sQVCq5T2BF-l_egncNsDIcqpj7tAUq?usp=drive_link';
const NEW_FOLDER = 'https://drive.google.com/drive/folders/1E-69rPY5Q_LbSml_mC-wPSWB-2Q4G6vH?usp=drive_link';

const OLD_PLATFORMS: SocialPlatform[] = ['instagram', 'tiktok', 'youtube'];
const NEW_PLATFORMS: SocialPlatform[] = ['instagram', 'tiktok', 'youtube', 'facebook'];

const MONTH_START = '2026-05-01';
const MONTH_END = '2026-05-31';
const POST_TIME_CT = '12:00';

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(`${apply ? 'APPLY' : 'DRY-RUN'} — Skibell ${MONTH_START} → ${MONTH_END}`);

  const admin = createAdminClient();

  const { data: userRow } = await admin
    .from('users')
    .select('id, email')
    .ilike('email', USER_EMAIL)
    .single<{ id: string; email: string }>();
  if (!userRow) throw new Error(`User not found: ${USER_EMAIL}`);
  console.log(`Running as ${userRow.email}`);

  const { data: client } = await admin
    .from('clients')
    .select('id, name, slug, services, is_active')
    .eq('slug', CLIENT_SLUG)
    .maybeSingle<{ id: string; name: string; slug: string; services: string[] | null; is_active: boolean | null }>();
  if (!client) throw new Error(`Client not found: ${CLIENT_SLUG}`);
  if (!client.is_active) throw new Error('Client inactive');
  if (!client.services?.includes('SMM')) throw new Error('Client missing SMM service');
  console.log(`Client: ${client.name}`);

  const { data: profiles } = await admin
    .from('social_profiles')
    .select('platform, late_account_id, is_active')
    .eq('client_id', client.id)
    .eq('is_active', true);
  const connected = new Set(
    (profiles ?? [])
      .filter((p) => typeof p.late_account_id === 'string' && p.late_account_id.length > 0)
      .map((p) => p.platform as SocialPlatform),
  );
  const missingNew = NEW_PLATFORMS.filter((p) => !connected.has(p));
  const missingOld = OLD_PLATFORMS.filter((p) => !connected.has(p));
  if (missingNew.length) throw new Error(`NEW drop missing Zernio profiles: ${missingNew.join(', ')}`);
  if (missingOld.length) throw new Error(`OLD drop missing Zernio profiles: ${missingOld.join(', ')}`);

  console.log('  ── List Drive folders ──');
  const oldList = await listVideosInFolder(userRow.id, OLD_FOLDER);
  const newList = await listVideosInFolder(userRow.id, NEW_FOLDER);
  const oldVideos = oldList.videos.filter((v) => v.size > 0).sort((a, b) => a.name.localeCompare(b.name));
  const newVideos = newList.videos.filter((v) => v.size > 0).sort((a, b) => a.name.localeCompare(b.name));
  console.log(`  OLD folder: ${oldVideos.length} videos`);
  console.log(`  NEW folder: ${newVideos.length} videos`);

  if (oldVideos.length === 0 && newVideos.length === 0) {
    throw new Error('Both folders empty — nothing to schedule');
  }

  const allMayDays = eachDay(MONTH_START, MONTH_END);
  const newDates = pickEven(allMayDays, newVideos.length);
  const newDateSet = new Set(newDates);
  const offDays = allMayDays.filter((d) => !newDateSet.has(d));
  const oldDates = pickEven(offDays, oldVideos.length);

  console.log('\n── Schedule plan ──');
  console.log(`NEW (share link, ${NEW_PLATFORMS.join(',')}):`);
  newVideos.forEach((v, i) => console.log(`  ${newDates[i]}  ${v.name}`));
  console.log(`OLD (no share, ${OLD_PLATFORMS.join(',')}):`);
  oldVideos.forEach((v, i) => console.log(`  ${oldDates[i]}  ${v.name}`));

  if (!apply) {
    console.log('\n(dry-run — re-run with --apply to execute pipeline)');
    return;
  }

  // NEW first so the share link exists before we touch OLD. NEW = drafts
  // until client approves on share link. OLD = direct publish (already
  // client-approved last month).
  const newResult = await runCalendarPipeline(admin, {
    label: 'NEW drop (share link, drafts until approved)',
    folderUrl: NEW_FOLDER,
    videos: newVideos,
    perVideoDates: newDates,
    defaultPostTimeCt: POST_TIME_CT,
    startDate: MONTH_START,
    endDate: MONTH_END,
    platforms: NEW_PLATFORMS,
    mintShareLink: true,
    draftMode: true,
    appUrl: APP_URL,
    clientId: client.id,
    userId: userRow.id,
    userEmail: userRow.email,
  });

  const oldResult = await runCalendarPipeline(admin, {
    label: 'OLD drop (no share, immediate publish)',
    folderUrl: OLD_FOLDER,
    videos: oldVideos,
    perVideoDates: oldDates,
    defaultPostTimeCt: POST_TIME_CT,
    startDate: MONTH_START,
    endDate: MONTH_END,
    platforms: OLD_PLATFORMS,
    mintShareLink: false,
    draftMode: false,
    appUrl: APP_URL,
    clientId: client.id,
    userId: userRow.id,
    userEmail: userRow.email,
  });

  console.log('\n══════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('══════════════════════════════════════════');
  console.log(`NEW: drop=${newResult.dropId ?? '—'} scheduled=${newResult.scheduled} failed=${newResult.failed}${newResult.error ? '  ✗ ' + newResult.error : ''}`);
  if (newResult.shareUrl) console.log(`     share: ${newResult.shareUrl}`);
  console.log(`OLD: drop=${oldResult.dropId ?? '—'} scheduled=${oldResult.scheduled} failed=${oldResult.failed}${oldResult.error ? '  ✗ ' + oldResult.error : ''}`);

  if (newResult.shareUrl) {
    try {
      const token = getMondayToken();
      const row = await findRowByName(token, MONDAY_ROW_NAME);
      if (row) {
        await setLaterCalendarLink(token, row.id, newResult.shareUrl);
        await setStatusScheduled(token, row.id);
        console.log(`Monday: row ${row.id} updated → Scheduled + share link`);
      } else {
        console.log(`Monday: no row matched name "${MONDAY_ROW_NAME}" in April 2026 group — share link not posted`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Monday writeback failed: ${msg}`);
    }
  }

  const failed = (newResult.error || newResult.failed > 0 || oldResult.error || oldResult.failed > 0);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('\n✗ Skibell scheduler crashed:', err);
  process.exit(1);
});
