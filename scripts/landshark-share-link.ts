/**
 * One-off recovery: mint the share link for the existing Land Shark image
 * drop using the standard `mintOrRefreshShareLink` helper. The drop was
 * created and scheduled by `landshark-image-drop.ts` but the inline insert
 * skipped the required client_id (helper denormalizes it). This finishes
 * the job.
 *
 * Run:
 *   npx tsx scripts/landshark-share-link.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createAdminClient } from '@/lib/supabase/admin';
import { mintOrRefreshShareLink } from '@/lib/calendar/share-link';

const DROP_ID = '5fc0ad82-8fe4-425c-bb49-2f7bd83acae4';
const CLIENT_ID = 'c21e5c9a-4d4a-41ce-9e80-bbb7ee6ef429';
const APP_URL = process.env.E2E_APP_URL ?? 'http://localhost:3001';

async function main() {
  const admin = createAdminClient();

  const { data: rows, error } = await admin
    .from('content_drop_videos')
    .select('id, scheduled_post_id, status, drive_file_name')
    .eq('drop_id', DROP_ID)
    .not('scheduled_post_id', 'is', null)
    .order('order_index');
  if (error) throw new Error(error.message);

  const postIds = (rows ?? [])
    .map((r) => r.scheduled_post_id as string | null)
    .filter((id): id is string => typeof id === 'string');
  if (postIds.length === 0) throw new Error('no scheduled posts on drop');

  console.log(`Scheduled posts on drop: ${postIds.length}`);

  const { data: reviewLinks, error: rlErr } = await admin
    .from('post_review_links')
    .insert(postIds.map((post_id) => ({ post_id })))
    .select('id, post_id');
  if (rlErr || !reviewLinks) throw new Error(`post_review_links: ${rlErr?.message}`);

  const reviewMap: Record<string, string> = {};
  for (const rl of reviewLinks) reviewMap[rl.post_id as string] = rl.id as string;

  const result = await mintOrRefreshShareLink(admin, {
    dropId: DROP_ID,
    clientId: CLIENT_ID,
    postIds,
    reviewMap,
  });

  const shareUrl = `${APP_URL}/s/${result.token}`;
  console.log(`\n  Public share URL:  ${shareUrl}`);
  console.log(`  Refreshed:         ${result.refreshed}`);
  console.log(`  Drop ID:           ${DROP_ID}`);
  console.log(`  Posts:             ${postIds.length} (IG + FB, draft)`);
  console.log(`  Admin calendar:    ${APP_URL}/admin/calendar/${DROP_ID}`);
}

main().catch((err) => {
  console.error('\n✗ Share-link recovery crashed:', err);
  process.exit(1);
});
