/**
 * One-off: ingest the Land Shark Vodka Seltzer image folder, generate
 * captions, schedule the carousel/image posts as drafts on Instagram +
 * Facebook, and mint a share link for Jack to review before approving.
 *
 * No Zernio call until the share link approves each post — scheduleDrop
 * runs in draftMode=true.
 *
 * Run:
 *   npx tsx scripts/landshark-image-drop.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createAdminClient } from '@/lib/supabase/admin';
import { listMediaInFolder } from '@/lib/calendar/drive-folder';
import { ingestDropImages } from '@/lib/calendar/ingest-images';
import { generateImageDropCaptions } from '@/lib/calendar/generate-image-caption';
import { scheduleDrop } from '@/lib/calendar/schedule-drop';
import { mintOrRefreshShareLink } from '@/lib/calendar/share-link';

const FOLDER_URL =
  'https://drive.google.com/drive/folders/1kEjHAxYQmNBgHudpaIAq9TMdz3GZwOFL';
const USER_EMAIL = 'jack@nativz.io';
const CLIENT_ID = 'c21e5c9a-4d4a-41ce-9e80-bbb7ee6ef429';
const TARGET_PLATFORMS = ['instagram', 'facebook'] as const;
const APP_URL = process.env.E2E_APP_URL ?? 'http://localhost:3001';

function step(label: string) {
  console.log(`\n── ${label} ──`);
}

async function main() {
  const admin = createAdminClient();

  step('Resolve Jack');
  const { data: userRow, error: userErr } = await admin
    .from('users')
    .select('id, email')
    .ilike('email', USER_EMAIL)
    .single<{ id: string; email: string }>();
  if (userErr || !userRow) throw new Error(`User not found: ${USER_EMAIL}`);
  console.log(`  ${userRow.email} → ${userRow.id}`);

  step('List Drive images');
  const { folderId, files } = await listMediaInFolder(userRow.id, FOLDER_URL, 'image');
  if (files.length === 0) throw new Error('Folder has no images');
  console.log(`  Folder ${folderId} → ${files.length} images`);
  for (const f of files) console.log(`    • ${f.name} (${(f.size / 1024).toFixed(0)} KiB)`);

  step('Create content_drops + content_drop_videos + asset rows');
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() + 1);
  const end = new Date(start);
  end.setDate(end.getDate() + Math.max(files.length - 1, 0));
  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);

  const { data: drop, error: dropErr } = await admin
    .from('content_drops')
    .insert({
      client_id: CLIENT_ID,
      created_by: userRow.id,
      drive_folder_url: FOLDER_URL,
      drive_folder_id: folderId,
      start_date: startDate,
      end_date: endDate,
      default_post_time: '10:00',
      total_videos: files.length,
      status: 'ingesting',
      media_type: 'image',
    })
    .select('*')
    .single();
  if (dropErr || !drop) throw new Error(`content_drops insert: ${dropErr?.message}`);
  console.log(`  drop.id = ${drop.id}`);

  const postRows = files.map((f, idx) => ({
    drop_id: drop.id,
    drive_file_id: f.id,
    drive_file_name: f.name,
    mime_type: f.mimeType,
    size_bytes: f.size,
    order_index: idx,
    status: 'pending',
    media_type: 'image',
  }));
  const { data: insertedPosts, error: vidErr } = await admin
    .from('content_drop_videos')
    .insert(postRows)
    .select('id, drive_file_id');
  if (vidErr || !insertedPosts) throw new Error(`content_drop_videos insert: ${vidErr?.message}`);

  const fileById = new Map(files.map((f) => [f.id, f]));
  const assetRows = insertedPosts
    .map((post) => {
      const file = fileById.get(post.drive_file_id);
      if (!file) return null;
      return {
        drop_video_id: post.id,
        drive_file_id: file.id,
        drive_file_name: file.name,
        mime_type: file.mimeType,
        size_bytes: file.size,
        position: 0,
        status: 'pending',
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  const { error: assetErr } = await admin.from('content_drop_post_assets').insert(assetRows);
  if (assetErr) throw new Error(`content_drop_post_assets insert: ${assetErr.message}`);
  console.log(`  ${insertedPosts.length} posts + ${assetRows.length} asset rows`);

  step('Ingest images (download + storage upload)');
  const t1 = Date.now();
  const ingest = await ingestDropImages(admin, { dropId: drop.id, userId: userRow.id });
  console.log(`  processed=${ingest.processed} failed=${ingest.failed} (${((Date.now() - t1) / 1000).toFixed(1)}s)`);
  if (ingest.processed === 0) throw new Error('image ingestion produced no processed assets');
  await admin
    .from('content_drops')
    .update({
      status: 'generating',
      processed_videos: ingest.processed,
      error_detail: ingest.failed > 0 ? `${ingest.failed} ingest failures` : null,
    })
    .eq('id', drop.id);

  step('Generate captions (vision-only)');
  const t2 = Date.now();
  const captions = await generateImageDropCaptions(admin, {
    dropId: drop.id,
    clientId: CLIENT_ID,
    userId: userRow.id,
    userEmail: userRow.email,
  });
  console.log(`  generated=${captions.generated} failed=${captions.failed} (${((Date.now() - t2) / 1000).toFixed(1)}s)`);
  if (captions.generated === 0) throw new Error('caption generation produced no results');
  await admin
    .from('content_drops')
    .update({
      status: captions.generated > 0 ? 'ready' : 'failed',
      error_detail: captions.failed > 0 ? `${captions.failed} caption failures` : null,
    })
    .eq('id', drop.id);

  step('Schedule (draft mode, IG + FB only)');
  const result = await scheduleDrop(admin, {
    dropId: drop.id,
    platforms: [...TARGET_PLATFORMS],
    draftMode: true,
  });
  console.log(`  scheduled=${result.scheduled} failed=${result.failed}`);
  if (result.errors.length) {
    for (const e of result.errors) console.warn(`    ✗ ${e.videoId}: ${e.reason}`);
  }
  if (result.scheduled === 0) throw new Error('no posts scheduled');

  step('Mint share link');
  const { data: scheduledRows } = await admin
    .from('content_drop_videos')
    .select('id, scheduled_post_id')
    .eq('drop_id', drop.id)
    .not('scheduled_post_id', 'is', null);
  const postIds = (scheduledRows ?? [])
    .map((r) => r.scheduled_post_id as string | null)
    .filter((id): id is string => typeof id === 'string');
  if (postIds.length === 0) throw new Error('no scheduled posts to share');

  const { data: reviewLinks, error: rlErr } = await admin
    .from('post_review_links')
    .insert(postIds.map((post_id) => ({ post_id })))
    .select('id, post_id, token');
  if (rlErr || !reviewLinks) throw new Error(`post_review_links insert: ${rlErr?.message}`);
  const reviewMap: Record<string, string> = {};
  for (const rl of reviewLinks) reviewMap[rl.post_id as string] = rl.id as string;

  const shareLink = await mintOrRefreshShareLink(admin, {
    dropId: drop.id,
    clientId: CLIENT_ID,
    postIds,
    reviewMap,
  });

  const shareUrl = `${APP_URL}/s/${shareLink.token}`;

  step('Done');
  console.log(`  Admin calendar:    ${APP_URL}/admin/calendar/${drop.id}`);
  console.log(`  Public share URL:  ${shareUrl}`);
  console.log(`  Drop ID:           ${drop.id}`);
  console.log(`  Posts:             ${postIds.length} (IG + FB, draft)`);
}

main().catch((err) => {
  console.error('\n✗ Land Shark drop crashed:', err);
  process.exit(1);
});
