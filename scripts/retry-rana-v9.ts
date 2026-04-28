/**
 * Retry the single Rana Furniture video that failed ingestion with a
 * transient Supabase 502 ("Storage upload failed: Bad Gateway") on the
 * initial run. All ten siblings landed; only `RF_Social Edit_v9.mp4` needs
 * to be picked up and slotted into the existing scheduled drop + share link.
 *
 *   npx tsx scripts/retry-rana-v9.ts          # dry-run
 *   npx tsx scripts/retry-rana-v9.ts --apply  # ingest + analyze + caption +
 *                                             # schedule + patch share link
 *
 * Slot: May 31 2026, 12:00 CT (continues the every-3-days cadence after May 28).
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createAdminClient } from '@/lib/supabase/admin';
import { ingestDrop } from '@/lib/calendar/ingest-drop';
import { analyzeDropVideos } from '@/lib/calendar/analyze-video';
import { generateDropCaptions } from '@/lib/calendar/generate-caption';
import { scheduleDrop } from '@/lib/calendar/schedule-drop';
import type { SocialPlatform } from '@/lib/posting';

const DROP_ID = 'a93efb4d-7662-48b8-b3ac-0ef843a3da79';
const VIDEO_ID = 'df1e63d5-cf7e-4d8f-84ba-650642c79e08';
const CLIENT_ID = '81584bba-5331-4a38-8a92-82c0e30eeae5';
const SHARE_TOKEN = '6723471e7244f8aa00989363d8e4bb5219e2be09269b8dfaa61215cfa4be8996';

const USER_EMAIL = (process.env.QUEUE_USER_EMAIL ?? 'jack@nativz.io').toLowerCase();

// 12:00 America/Chicago on 2026-05-31 — continues May 1/4/7/.../28 cadence.
// May 31 in CT is CDT (UTC-5), so 12:00 CT == 17:00 UTC.
const TARGET_SCHEDULED_AT = '2026-05-31T17:00:00.000Z';
const PLATFORMS: SocialPlatform[] = ['instagram', 'tiktok', 'youtube'];

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(`${apply ? 'APPLY' : 'DRY-RUN'} — retrying Rana v9 into drop ${DROP_ID}`);

  const admin = createAdminClient();

  const { data: userRow } = await admin
    .from('users')
    .select('id, email')
    .ilike('email', USER_EMAIL)
    .single<{ id: string; email: string }>();
  if (!userRow) throw new Error(`User not found: ${USER_EMAIL}`);

  const { data: video } = await admin
    .from('content_drop_videos')
    .select('id, status, drive_file_name, error_detail')
    .eq('id', VIDEO_ID)
    .single<{ id: string; status: string; drive_file_name: string; error_detail: string | null }>();
  if (!video) throw new Error(`Video ${VIDEO_ID} not found`);
  console.log(`  Video: ${video.drive_file_name} (current status: ${video.status})`);
  if (video.error_detail) console.log(`  Last error: ${video.error_detail}`);

  if (!apply) {
    console.log('\nPlan:');
    console.log('  1. Reset video → status=pending, clear error_detail');
    console.log('  2. ingestDrop  (only this video is pending)');
    console.log('  3. analyzeDropVideos  (skips already-analyzed siblings)');
    console.log('  4. generateDropCaptions  (skips siblings with captions)');
    console.log('  5. Flip drop → status=ready briefly, scheduleDrop with includedVideoIds=[v9], flip back');
    console.log('  6. Append new post_id to share_link.included_post_ids');
    console.log('  7. Insert post_review_links row + patch share_link.post_review_link_map');
    console.log('\n(dry-run — re-run with --apply)');
    return;
  }

  console.log('\n── 1/7 Reset video to pending ──');
  await admin
    .from('content_drop_videos')
    .update({ status: 'pending', error_detail: null })
    .eq('id', VIDEO_ID);
  console.log('  ✓');

  console.log('\n── 2/7 Ingest ──');
  const ingest = await ingestDrop(admin, { dropId: DROP_ID, userId: userRow.id });
  console.log(`  processed=${ingest.processed} failed=${ingest.failed}`);
  if (ingest.processed === 0) throw new Error('Ingest failed again — see error_detail on the video row');

  console.log('\n── 3/7 Analyze ──');
  const analysis = await analyzeDropVideos(admin, { dropId: DROP_ID, userId: userRow.id });
  console.log(`  analyzed=${analysis.analyzed} failed=${analysis.failed}`);

  console.log('\n── 4/7 Generate caption ──');
  const captions = await generateDropCaptions(admin, {
    dropId: DROP_ID,
    clientId: CLIENT_ID,
    userId: userRow.id,
    userEmail: userRow.email,
  });
  console.log(`  generated=${captions.generated} failed=${captions.failed}`);

  console.log('\n── 5/7 Schedule (draft mode, only v9) ──');
  // scheduleDrop refuses to run unless drop status='ready'. Flip, schedule, flip back.
  await admin.from('content_drops').update({ status: 'ready' }).eq('id', DROP_ID);
  const sched = await scheduleDrop(admin, {
    dropId: DROP_ID,
    includedVideoIds: [VIDEO_ID],
    overrides: { [VIDEO_ID]: TARGET_SCHEDULED_AT },
    platforms: PLATFORMS,
    draftMode: true,
  });
  console.log(`  scheduled=${sched.scheduled} failed=${sched.failed}`);
  // scheduleDrop already flipped to 'scheduled' when sched.scheduled > 0 — only flip back if it stayed 'ready'.
  if (sched.scheduled === 0) {
    await admin.from('content_drops').update({ status: 'scheduled' }).eq('id', DROP_ID);
  }
  if (sched.scheduled === 0) throw new Error(`Schedule failed: ${JSON.stringify(sched.errors)}`);

  console.log('\n── 6/7 Look up new post id ──');
  const { data: newVideoRow } = await admin
    .from('content_drop_videos')
    .select('scheduled_post_id')
    .eq('id', VIDEO_ID)
    .single<{ scheduled_post_id: string | null }>();
  const newPostId = newVideoRow?.scheduled_post_id;
  if (!newPostId) throw new Error('scheduled_post_id missing on v9 row after scheduleDrop');
  console.log(`  new post_id: ${newPostId}`);

  console.log('\n── 7/7 Patch share link + insert review link ──');
  const { data: shareRow } = await admin
    .from('content_drop_share_links')
    .select('id, included_post_ids, post_review_link_map')
    .eq('token', SHARE_TOKEN)
    .single<{ id: string; included_post_ids: string[]; post_review_link_map: Record<string, string> }>();
  if (!shareRow) throw new Error(`Share link with token ${SHARE_TOKEN} not found`);

  if (shareRow.included_post_ids.includes(newPostId)) {
    console.log('  share link already includes this post — nothing to patch');
  } else {
    const { data: reviewLink } = await admin
      .from('post_review_links')
      .insert({ post_id: newPostId })
      .select('id, post_id')
      .single<{ id: string; post_id: string }>();
    if (!reviewLink) throw new Error('Failed to insert post_review_links row');

    const updatedIds = [...shareRow.included_post_ids, newPostId];
    const updatedMap = { ...shareRow.post_review_link_map, [newPostId]: reviewLink.id };
    const { error: shareErr } = await admin
      .from('content_drop_share_links')
      .update({ included_post_ids: updatedIds, post_review_link_map: updatedMap })
      .eq('id', shareRow.id);
    if (shareErr) throw new Error(`share link update: ${shareErr.message}`);
    console.log(`  ✓ share link now references ${updatedIds.length} posts`);
    console.log(`  ✓ review link id: ${reviewLink.id}`);
  }

  console.log('\n══════════════════════════════════════════');
  console.log(`Rana v9 retry complete. Share URL: https://cortex.nativz.io/c/${SHARE_TOKEN}`);
  console.log('══════════════════════════════════════════');
}

main().catch((err) => {
  console.error('\n✗ retry-rana-v9 crashed:', err);
  process.exit(1);
});
