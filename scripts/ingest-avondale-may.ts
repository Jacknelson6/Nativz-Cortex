/**
 * Server-side end-to-end ingest for Avondale Private Lending's May calendar.
 *
 *   npx tsx scripts/ingest-avondale-may.ts
 *
 * Why this script exists:
 *   The /admin/calendar UI flow needs Jack's browser-side Google session to
 *   read Drive. We have a domain-wide-delegated service account
 *   (cortex-workspace-reader@cortex-490016) that can impersonate any
 *   @nativz.io user — `getDriveToken` already falls back to it when there's
 *   no per-user OAuth row. So we can run the entire pipeline server-side
 *   acting as Jack.
 *
 * What it does (mirrors /api/calendar/drops/[id]/process):
 *   1. Lists video files in the Drive folder (SA + DWD as Jack)
 *   2. Inserts content_drops + content_drop_videos rows
 *   3. ingestDrop      — downloads each video, uploads to Supabase storage
 *   4. analyzeDropVideos — Gemini E2E analysis (concurrency 2)
 *   5. generateDropCaptions — caption gen with iterations + voice anchors
 *   6. Prints all generated captions for review
 *
 * Idempotent guard: refuses to create a second drop for the same client +
 * same Drive folder + same start_date.
 *
 * Stops short of scheduling — that's a separate explicit step
 * (scripts/schedule-avondale-may.ts <dropId>).
 */

import fs from 'node:fs';
import path from 'node:path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const CLIENT_ID = 'fb8a1a10-166c-43e7-bd13-981486095cb4';
const JACK_USER_ID = '55dc3ef9-ac65-491a-b74f-d71a150b46e5';
const DRIVE_FOLDER_URL = 'https://drive.google.com/drive/folders/1ylZ-UDjOZb0OY21_8WTw_Wr6Y_PsfhGN';
const START_DATE = '2026-05-01';
const END_DATE = '2026-05-31';
const DEFAULT_POST_TIME = '10:00';
const JACK_EMAIL = 'jack@nativz.io';

async function main() {
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const { listVideosInFolder } = await import('@/lib/calendar/drive-folder');
  const { ingestDrop } = await import('@/lib/calendar/ingest-drop');
  const { analyzeDropVideos } = await import('@/lib/calendar/analyze-video');
  const { generateDropCaptions } = await import('@/lib/calendar/generate-caption');

  const admin = createAdminClient();

  // Idempotency: don't create a duplicate drop for the same window.
  const { data: existing } = await admin
    .from('content_drops')
    .select('id, status')
    .eq('client_id', CLIENT_ID)
    .eq('drive_folder_url', DRIVE_FOLDER_URL)
    .eq('start_date', START_DATE)
    .maybeSingle();
  if (existing) {
    console.error(
      `✗ A drop already exists for this folder + window: ${existing.id} (status=${existing.status}).`,
    );
    console.error('  If you want a fresh run, delete that drop in /admin/calendar first.');
    process.exit(1);
  }

  console.log(`→ Listing videos in Drive folder (impersonating ${JACK_EMAIL})…`);
  const { folderId, videos } = await listVideosInFolder(JACK_USER_ID, DRIVE_FOLDER_URL);
  console.log(`  Found ${videos.length} video files (folderId=${folderId}).`);
  if (videos.length === 0) {
    console.error('✗ No video files in folder. Aborting.');
    process.exit(1);
  }

  console.log(`→ Inserting content_drops row (${START_DATE} → ${END_DATE}, default ${DEFAULT_POST_TIME})…`);
  const { data: drop, error: dropErr } = await admin
    .from('content_drops')
    .insert({
      client_id: CLIENT_ID,
      created_by: JACK_USER_ID,
      drive_folder_url: DRIVE_FOLDER_URL,
      drive_folder_id: folderId,
      start_date: START_DATE,
      end_date: END_DATE,
      default_post_time: DEFAULT_POST_TIME,
      total_videos: videos.length,
      status: 'ingesting',
    })
    .select('*')
    .single();
  if (dropErr || !drop) {
    console.error('✗ Failed to create drop:', dropErr?.message);
    process.exit(1);
  }
  console.log(`  Drop ${drop.id} created.`);

  const videoRows = videos.map((v, idx) => ({
    drop_id: drop.id,
    drive_file_id: v.id,
    drive_file_name: v.name,
    mime_type: v.mimeType,
    size_bytes: v.size,
    order_index: idx,
    status: 'pending',
  }));
  const { error: vidErr } = await admin.from('content_drop_videos').insert(videoRows);
  if (vidErr) {
    console.error('✗ Failed to insert video rows:', vidErr.message);
    process.exit(1);
  }
  console.log(`  Inserted ${videoRows.length} video rows.`);

  console.log('\n→ Step 1/3: Downloading + uploading to Supabase storage…');
  const ingest = await ingestDrop(admin, { dropId: drop.id, userId: JACK_USER_ID });
  console.log(`  Ingested ${ingest.processed}/${videos.length} (failed: ${ingest.failed}).`);
  if (ingest.processed === 0) {
    await admin
      .from('content_drops')
      .update({ status: 'failed', error_detail: 'All videos failed to ingest' })
      .eq('id', drop.id);
    console.error('✗ All videos failed ingest. Aborting.');
    process.exit(1);
  }
  await admin
    .from('content_drops')
    .update({
      status: 'analyzing',
      processed_videos: ingest.processed,
      updated_at: new Date().toISOString(),
      error_detail: ingest.failed > 0 ? `${ingest.failed} video(s) failed during ingestion` : null,
    })
    .eq('id', drop.id);

  console.log('\n→ Step 2/3: Gemini E2E video analysis…');
  const analysis = await analyzeDropVideos(admin, { dropId: drop.id, userId: JACK_USER_ID });
  console.log(`  Analyzed ${analysis.analyzed}/${ingest.processed} (failed: ${analysis.failed}).`);
  if (analysis.analyzed === 0) {
    await admin
      .from('content_drops')
      .update({
        status: 'failed',
        updated_at: new Date().toISOString(),
        error_detail: 'All videos failed during analysis',
      })
      .eq('id', drop.id);
    console.error('✗ All analyses failed. Aborting.');
    process.exit(1);
  }
  await admin
    .from('content_drops')
    .update({
      status: 'generating',
      updated_at: new Date().toISOString(),
      error_detail: analysis.failed > 0 ? `${analysis.failed} video(s) failed during analysis` : null,
    })
    .eq('id', drop.id);

  console.log('\n→ Step 3/3: Caption generation (3 iterations, score ≥ 80)…');
  const captions = await generateDropCaptions(admin, {
    dropId: drop.id,
    clientId: CLIENT_ID,
    userId: JACK_USER_ID,
    userEmail: JACK_EMAIL,
  });
  console.log(`  Generated ${captions.generated}/${analysis.analyzed} (failed: ${captions.failed}).`);
  await admin
    .from('content_drops')
    .update({
      status: captions.generated > 0 ? 'ready' : 'failed',
      updated_at: new Date().toISOString(),
      error_detail: captions.failed > 0 ? `${captions.failed} caption(s) failed to generate` : null,
    })
    .eq('id', drop.id);

  // Print captions for review
  console.log(`\n=== Generated captions for drop ${drop.id} ===\n`);
  const { data: finalRows } = await admin
    .from('content_drop_videos')
    .select('order_index, drive_file_name, status, draft_caption, draft_hashtags')
    .eq('drop_id', drop.id)
    .order('order_index');
  for (const v of finalRows ?? []) {
    console.log(`#${String(v.order_index).padStart(2, '0')} [${v.status}] ${v.drive_file_name}`);
    if (v.draft_caption) {
      console.log(`   ${v.draft_caption}`);
      if (v.draft_hashtags?.length) {
        console.log(`   #${(v.draft_hashtags as string[]).join(' #')}`);
      }
    }
    console.log();
  }

  console.log(`Drop ID: ${drop.id}`);
  console.log(`Status:  ${captions.generated > 0 ? 'ready' : 'failed'}`);
  console.log('\nNext: review captions, then');
  console.log(`  npx tsx scripts/schedule-avondale-may.ts ${drop.id} --dry`);
  console.log(`  npx tsx scripts/schedule-avondale-may.ts ${drop.id}`);
}

main().catch((err) => {
  console.error('Ingest failed:', err);
  process.exit(1);
});
