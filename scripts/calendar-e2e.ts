/**
 * Content-calendar end-to-end smoke test.
 *
 * Exercises the full pipeline against a real Drive folder + real Supabase +
 * real Gemini + real OpenRouter, but synthesizes scheduled-post rows directly
 * (status='draft') so we don't actually publish to Zernio. The output is a
 * working share link Jack can open at http://localhost:3001/c/<token>.
 *
 * Steps:
 *   1. listVideosInFolder + pick smallest N videos
 *   2. Create content_drops row + content_drop_videos rows
 *   3. ingestDrop → Supabase storage + thumbnails
 *   4. analyzeDropVideos → Gemini context per video
 *   5. generateDropCaptions → caption variants per video
 *   6. Synthesize scheduled_posts rows (status='draft', no Zernio call)
 *   7. Mint post_review_links + content_drop_share_links
 *   8. Send a synthetic test comment so the email pipeline fires
 *   9. Print the share URL
 *
 * Run:
 *   npx tsx scripts/calendar-e2e.ts
 *
 * Env overrides:
 *   E2E_FOLDER_URL, E2E_USER_EMAIL, E2E_CLIENT_ID, E2E_VIDEO_LIMIT,
 *   E2E_TEST_COMMENT (boolean — defaults true)
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { randomUUID } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { listVideosInFolder } from '@/lib/calendar/drive-folder';
import { ingestDrop } from '@/lib/calendar/ingest-drop';
import { analyzeDropVideos } from '@/lib/calendar/analyze-video';
import { generateDropCaptions } from '@/lib/calendar/generate-caption';
import { createNotification } from '@/lib/notifications/create';
import { sendDropCommentEmail } from '@/lib/email/resend';

const FOLDER_URL =
  process.env.E2E_FOLDER_URL ??
  'https://drive.google.com/drive/folders/1NmKrZoqFjrJo4WLQFuYih0nWxx8bBvoU?usp=drive_link';
const USER_EMAIL = (process.env.E2E_USER_EMAIL ?? 'jack@nativz.io').toLowerCase();
const CLIENT_ID = process.env.E2E_CLIENT_ID ?? 'e1b61d86-8c55-4c5b-b19c-a1542b41492d'; // All Shutters and Blinds
const VIDEO_LIMIT = Number(process.env.E2E_VIDEO_LIMIT ?? '2');
const TEST_COMMENT = process.env.E2E_TEST_COMMENT !== 'false';
// Cortex runs on 3001 locally. NEXT_PUBLIC_APP_URL is sometimes set to 3000
// for the sibling app on Jack's machine; force 3001 so the printed share URL
// actually opens the local Cortex dev server.
const APP_URL = process.env.E2E_APP_URL ?? 'http://localhost:3001';

function step(label: string) {
  console.log(`\n── ${label} ──`);
}

async function main() {
  const admin = createAdminClient();

  step('Resolve user');
  const { data: userRow, error: userErr } = await admin
    .from('users')
    .select('id, email')
    .ilike('email', USER_EMAIL)
    .single<{ id: string; email: string }>();
  if (userErr || !userRow) throw new Error(`User not found: ${USER_EMAIL}`);
  const userId = userRow.id;
  console.log(`  ${userRow.email} → ${userId}`);

  step('List Drive videos + pick smallest');
  const { folderId, videos } = await listVideosInFolder(userId, FOLDER_URL);
  if (videos.length === 0) throw new Error('Folder has no videos');
  const sorted = [...videos].filter((v) => v.size > 0).sort((a, b) => a.size - b.size);
  const picked = sorted.slice(0, VIDEO_LIMIT);
  console.log(`  Folder ${folderId} has ${videos.length} videos; using ${picked.length}:`);
  for (const v of picked) console.log(`    • ${v.name} (${(v.size / 1024 / 1024).toFixed(1)} MiB)`);

  step('Create content_drops + content_drop_videos');
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() + 30);
  const end = new Date(start);
  end.setDate(end.getDate() + Math.max(picked.length - 1, 0));
  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);

  const { data: drop, error: dropErr } = await admin
    .from('content_drops')
    .insert({
      client_id: CLIENT_ID,
      created_by: userId,
      drive_folder_url: FOLDER_URL,
      drive_folder_id: folderId,
      start_date: startDate,
      end_date: endDate,
      default_post_time: '10:00',
      total_videos: picked.length,
      status: 'ingesting',
    })
    .select('*')
    .single();
  if (dropErr || !drop) throw new Error(`content_drops insert: ${dropErr?.message}`);
  console.log(`  drop.id = ${drop.id}`);

  const videoRows = picked.map((v, idx) => ({
    drop_id: drop.id,
    drive_file_id: v.id,
    drive_file_name: v.name,
    mime_type: v.mimeType,
    size_bytes: v.size,
    order_index: idx,
    status: 'pending',
  }));
  const { error: vidErr } = await admin.from('content_drop_videos').insert(videoRows);
  if (vidErr) throw new Error(`content_drop_videos insert: ${vidErr.message}`);
  console.log(`  inserted ${videoRows.length} video rows`);

  step('Ingest (download + storage upload + thumbnails)');
  const t1 = Date.now();
  const ingest = await ingestDrop(admin, { dropId: drop.id, userId });
  console.log(`  processed=${ingest.processed} failed=${ingest.failed} (${((Date.now() - t1) / 1000).toFixed(1)}s)`);
  if (ingest.processed === 0) throw new Error('ingestion produced no processed videos');
  await admin
    .from('content_drops')
    .update({
      status: 'analyzing',
      processed_videos: ingest.processed,
      error_detail: ingest.failed > 0 ? `${ingest.failed} ingest failures` : null,
    })
    .eq('id', drop.id);

  step('Analyze (Gemini per video)');
  const t2 = Date.now();
  const analysis = await analyzeDropVideos(admin, { dropId: drop.id, userId });
  console.log(`  analyzed=${analysis.analyzed} failed=${analysis.failed} (${((Date.now() - t2) / 1000).toFixed(1)}s)`);
  if (analysis.analyzed === 0) throw new Error('analysis produced no results');
  await admin
    .from('content_drops')
    .update({
      status: 'generating',
      error_detail: analysis.failed > 0 ? `${analysis.failed} analysis failures` : null,
    })
    .eq('id', drop.id);

  step('Generate captions');
  const t3 = Date.now();
  const captions = await generateDropCaptions(admin, {
    dropId: drop.id,
    clientId: CLIENT_ID,
    userId,
    userEmail: userRow.email,
  });
  console.log(`  generated=${captions.generated} failed=${captions.failed} (${((Date.now() - t3) / 1000).toFixed(1)}s)`);
  if (captions.generated === 0) throw new Error('caption generation produced no results');
  await admin
    .from('content_drops')
    .update({
      status: captions.generated > 0 ? 'ready' : 'failed',
      error_detail: captions.failed > 0 ? `${captions.failed} caption failures` : null,
    })
    .eq('id', drop.id);

  step('Synthesize scheduled_posts (status=draft, no Zernio)');
  const { data: ready } = await admin
    .from('content_drop_videos')
    .select('id, draft_caption, draft_hashtags, thumbnail_url')
    .eq('drop_id', drop.id)
    .eq('status', 'ready')
    .order('order_index');
  if (!ready || ready.length === 0) throw new Error('no ready videos to attach posts to');

  const postRows = ready.map((v, idx) => {
    const slot = new Date(start);
    slot.setDate(slot.getDate() + idx);
    slot.setHours(10, 0, 0, 0);
    return {
      client_id: CLIENT_ID,
      created_by: userId,
      caption: (v as { draft_caption: string | null }).draft_caption ?? '',
      hashtags: (v as { draft_hashtags: string[] | null }).draft_hashtags ?? [],
      cover_image_url: (v as { thumbnail_url: string | null }).thumbnail_url,
      scheduled_at: slot.toISOString(),
      status: 'draft',
      post_type: 'reel',
    };
  });
  const { data: posts, error: postErr } = await admin
    .from('scheduled_posts')
    .insert(postRows)
    .select('id');
  if (postErr || !posts) throw new Error(`scheduled_posts insert: ${postErr?.message}`);

  for (let i = 0; i < ready.length; i += 1) {
    await admin
      .from('content_drop_videos')
      .update({ scheduled_post_id: posts[i].id, draft_scheduled_at: postRows[i].scheduled_at })
      .eq('id', ready[i].id);
  }
  console.log(`  linked ${posts.length} draft posts to videos`);

  step('Mint share link');
  const postIds = posts.map((p) => p.id as string);
  const { data: reviewLinks, error: rlErr } = await admin
    .from('post_review_links')
    .insert(postIds.map((postId) => ({ post_id: postId })))
    .select('id, post_id, token');
  if (rlErr || !reviewLinks) throw new Error(`post_review_links insert: ${rlErr?.message}`);
  const reviewMap: Record<string, string> = {};
  for (const rl of reviewLinks) reviewMap[rl.post_id as string] = rl.id as string;

  const { data: shareLink, error: slErr } = await admin
    .from('content_drop_share_links')
    .insert({
      drop_id: drop.id,
      included_post_ids: postIds,
      post_review_link_map: reviewMap,
    })
    .select('id, token, expires_at')
    .single();
  if (slErr || !shareLink) throw new Error(`content_drop_share_links insert: ${slErr?.message}`);

  const shareUrl = `${APP_URL}/c/${shareLink.token}`;
  console.log(`  ${shareUrl}`);

  if (TEST_COMMENT) {
    step('Send synthetic comment notification (email pipeline test)');
    const firstPostId = postIds[0];
    const reviewLinkId = reviewMap[firstPostId];

    const { error: commentErr } = await admin.from('post_review_comments').insert({
      review_link_id: reviewLinkId,
      author_name: 'Calendar E2E Bot',
      content: 'Smoke test from scripts/calendar-e2e.ts — confirms share-link → comment → email path is wired.',
      status: 'comment',
    });
    if (commentErr) console.warn(`  ⚠ comment insert failed: ${commentErr.message}`);

    const { data: clientRow } = await admin
      .from('clients')
      .select('name')
      .eq('id', CLIENT_ID)
      .single<{ name: string }>();
    const clientName = clientRow?.name ?? 'Client';

    await sendDropCommentEmail({
      to: userRow.email,
      authorName: 'Calendar E2E Bot',
      clientName,
      status: 'comment',
      contentPreview:
        'Smoke test from scripts/calendar-e2e.ts — confirms share-link → comment → email path is wired.',
      dropUrl: `${APP_URL}/admin/calendar/${drop.id}`,
    });

    await createNotification({
      recipientUserId: userId,
      type: 'general',
      title: `Calendar E2E Bot left a comment on ${clientName}`,
      body: 'Smoke test from scripts/calendar-e2e.ts',
      linkPath: `/admin/calendar/${drop.id}`,
    }).catch(() => {});
    console.log(`  email + in-app notification sent to ${userRow.email}`);
  }

  step('Done');
  console.log(`  Content calendar:  ${APP_URL}/admin/calendar/${drop.id}`);
  console.log(`  Public share URL:  ${shareUrl}`);
  console.log(`  Drop ID:           ${drop.id}`);
  console.log(`  Run ID:            ${randomUUID().slice(0, 8)}`);
}

main().catch((err) => {
  console.error('\n✗ E2E crashed:', err);
  process.exit(1);
});
