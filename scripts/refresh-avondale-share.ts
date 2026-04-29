/**
 * Audit + clean up Avondale May posts on Zernio, then mint a fresh share link.
 *
 *   npx tsx scripts/refresh-avondale-share.ts
 *
 * Steps:
 *   1. Pull the 10 expected late_post_ids from scheduled_posts for the May drop.
 *   2. Ask Zernio for all FB + TikTok posts scheduled in May 2026 for Avondale.
 *   3. Anything Zernio knows about that isn't in our expected set is an orphan
 *      from the swap-captions delete-then-republish — delete those.
 *   4. Drop the existing content_drop_share_links row for this drop and mint
 *      a fresh one so Jack gets a brand-new token.
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
const FB_ACCOUNT = '69e0f8347dea335c2bfdcb0f';
const TIKTOK_ACCOUNT = '69e114a17dea335c2bfe684d';
const MAY_START = '2026-05-01';
const MAY_END = '2026-06-01';

async function main() {
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const { getPostingService } = await import('@/lib/posting');
  const admin = createAdminClient();
  const service = getPostingService();

  const { data: videos, error: videosErr } = await admin
    .from('content_drop_videos')
    .select('scheduled_post_id, order_index')
    .eq('drop_id', DROP_ID)
    .order('order_index');
  if (videosErr) throw new Error(videosErr.message);

  const postIds = (videos ?? [])
    .map((v) => v.scheduled_post_id as string | null)
    .filter((p): p is string => typeof p === 'string');
  if (postIds.length !== 10) {
    throw new Error(`Expected 10 scheduled_post_ids, got ${postIds.length}`);
  }

  const { data: posts, error: postsErr } = await admin
    .from('scheduled_posts')
    .select('id, late_post_id, scheduled_at')
    .in('id', postIds);
  if (postsErr) throw new Error(postsErr.message);

  const expectedLateIds = new Set(
    (posts ?? [])
      .map((p) => p.late_post_id as string | null)
      .filter((id): id is string => typeof id === 'string'),
  );
  console.log(`Expected late_post_ids: ${expectedLateIds.size}`);

  // 1. Pull Zernio's view for the two platforms.
  console.log('Listing Zernio posts (FB + TikTok)…');
  const [fbAll, ttAll] = await Promise.all([
    service.listPosts({ platform: 'facebook', limit: 200 }),
    service.listPosts({ platform: 'tiktok', limit: 200 }),
  ]);

  // Filter to posts targeting Avondale's accounts AND scheduled in May 2026.
  const inMay = (p: { scheduledFor: string | null }) => {
    if (!p.scheduledFor) return false;
    const d = p.scheduledFor.slice(0, 10);
    return d >= MAY_START && d < MAY_END;
  };

  const targetsAvondale = (p: {
    platforms: Array<{ accountId: string; platform: string }>;
  }) =>
    p.platforms.some(
      (pl) => pl.accountId === FB_ACCOUNT || pl.accountId === TIKTOK_ACCOUNT,
    );

  const dedupe = new Map<string, (typeof fbAll)[number]>();
  for (const p of [...fbAll, ...ttAll]) {
    if (inMay(p) && targetsAvondale(p)) dedupe.set(p.id, p);
  }
  const candidates = Array.from(dedupe.values());
  console.log(`Avondale May posts on Zernio: ${candidates.length}`);

  const orphans = candidates.filter((p) => !expectedLateIds.has(p.id));
  console.log(`Orphans (not in expected 10): ${orphans.length}`);
  if (orphans.length > 0) {
    for (const o of orphans) {
      console.log(
        `  - ${o.id} @ ${o.scheduledFor} status=${o.status} :: ${o.content.slice(0, 60)}…`,
      );
    }
  }

  // 2. Delete orphans.
  let deleted = 0;
  let failed = 0;
  for (const o of orphans) {
    try {
      await service.deletePost(o.id);
      deleted += 1;
      console.log(`  ✓ deleted orphan ${o.id}`);
    } catch (e) {
      failed += 1;
      console.log(`  ✗ delete failed for ${o.id}: ${e instanceof Error ? e.message : 'unknown'}`);
    }
  }

  // 3. Drop existing share link, then mint a fresh one.
  console.log('\nRotating share link…');
  const { error: delShareErr } = await admin
    .from('content_drop_share_links')
    .delete()
    .eq('drop_id', DROP_ID);
  if (delShareErr) {
    console.log(`  ⚠ existing share link delete failed: ${delShareErr.message}`);
  } else {
    console.log('  ✓ existing share link rows removed');
  }

  // Reuse existing post_review_links if any exist for these post_ids,
  // otherwise create them.
  const { data: existingReviewLinks } = await admin
    .from('post_review_links')
    .select('id, post_id')
    .in('post_id', postIds);

  const reviewMap: Record<string, string> = {};
  for (const rl of existingReviewLinks ?? []) {
    reviewMap[rl.post_id as string] = rl.id as string;
  }
  const missing = postIds.filter((id) => !reviewMap[id]);
  if (missing.length > 0) {
    const { data: newLinks, error: newLinksErr } = await admin
      .from('post_review_links')
      .insert(missing.map((post_id) => ({ post_id })))
      .select('id, post_id');
    if (newLinksErr || !newLinks) {
      throw new Error(`post_review_links insert failed: ${newLinksErr?.message}`);
    }
    for (const rl of newLinks) reviewMap[rl.post_id as string] = rl.id as string;
  }

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
  console.log('\nDone.');
  console.log(`  Orphans deleted: ${deleted}/${orphans.length}` + (failed ? ` (${failed} failed)` : ''));
  console.log(`  New share link: ${appUrl}/c/${shareLink.token}`);
  console.log(`  Expires: ${shareLink.expires_at}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
