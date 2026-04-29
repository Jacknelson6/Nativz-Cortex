/**
 * Mint a public client review link for Avondale's May calendar.
 *
 *   npx tsx scripts/mint-avondale-share.ts
 *
 * Mirrors POST /api/calendar/drops/[id]/share but runs server-side via
 * admin client (no browser session). Steps:
 *   1. Pulls all 10 scheduled_post_ids from content_drop_videos
 *   2. Inserts one post_review_links row per post
 *   3. Inserts content_drop_share_links row with the post → review-link map
 *   4. Prints the public /c/<token> URL
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

const DROP_ID = 'c6c4ccb7-49d1-4c6b-8786-9e8c7ad0778d';

async function main() {
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const admin = createAdminClient();

  const { data: videos, error: videosErr } = await admin
    .from('content_drop_videos')
    .select('id, scheduled_post_id, drive_file_name, order_index')
    .eq('drop_id', DROP_ID)
    .order('order_index');
  if (videosErr) throw new Error(videosErr.message);

  const postIds = (videos ?? [])
    .map((v) => v.scheduled_post_id as string | null)
    .filter((p): p is string => typeof p === 'string');

  if (postIds.length === 0) {
    console.error('✗ No scheduled posts on this calendar yet.');
    process.exit(1);
  }
  console.log(`Found ${postIds.length} scheduled posts.`);

  // Reuse existing share link if one already exists for this drop.
  const { data: existing } = await admin
    .from('content_drop_share_links')
    .select('id, token, expires_at')
    .eq('drop_id', DROP_ID)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://cortex.nativz.io';
    console.log(`\nExisting share link found:`);
    console.log(`  ${appUrl}/c/${existing.token}`);
    console.log(`  expires: ${existing.expires_at}`);
    return;
  }

  console.log('Minting per-post review links…');
  const linkRows = postIds.map((postId) => ({ post_id: postId }));
  const { data: reviewLinks, error: linkErr } = await admin
    .from('post_review_links')
    .insert(linkRows)
    .select('id, post_id, token');
  if (linkErr || !reviewLinks) {
    throw new Error(`post_review_links insert failed: ${linkErr?.message}`);
  }
  console.log(`  ${reviewLinks.length} review links created.`);

  const reviewMap: Record<string, string> = {};
  for (const rl of reviewLinks) {
    reviewMap[rl.post_id as string] = rl.id as string;
  }

  console.log('Creating content_drop_share_links row…');
  const { data: shareLink, error: shareErr } = await admin
    .from('content_drop_share_links')
    .insert({
      drop_id: DROP_ID,
      included_post_ids: postIds,
      post_review_link_map: reviewMap,
    })
    .select('id, token, expires_at')
    .single();
  if (shareErr || !shareLink) {
    throw new Error(`share link insert failed: ${shareErr?.message}`);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://cortex.nativz.io';
  console.log(`\n✓ Share link minted:`);
  console.log(`  ${appUrl}/c/${shareLink.token}`);
  console.log(`  expires: ${shareLink.expires_at}`);
}

main().catch((err) => {
  console.error('Mint failed:', err);
  process.exit(1);
});
