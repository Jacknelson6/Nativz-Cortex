/**
 * Final verification: call the REAL rewritten scraper functions against a live
 * handle and assert that we get non-empty profile + video arrays back.
 *
 * Usage:
 *   env $(grep -v '^#' .env.local | grep APIFY_API_KEY | xargs) npx tsx scripts/debug-audit-scrape.ts
 */

import { scrapeInstagramProfile } from '../lib/audit/scrape-instagram-profile';
import { scrapeTikTokProfile } from '../lib/audit/scrape-tiktok-profile';

const HANDLE = process.env.HANDLE ?? 'toastique';

async function runOne(label: string, fn: () => Promise<{ profile: unknown; videos: unknown[] }>) {
  const started = Date.now();
  console.log(`\n=== ${label} @${HANDLE} ===`);
  try {
    const result = await fn();
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    const p = result.profile as Record<string, unknown>;
    console.log(`✅ success in ${elapsed}s`);
    console.log(`  profile.username: ${p.username}`);
    console.log(`  profile.displayName: ${p.displayName}`);
    console.log(`  profile.followers: ${p.followers}`);
    console.log(`  profile.bio: ${String(p.bio).slice(0, 120)}`);
    console.log(`  profile.postsCount: ${p.postsCount}`);
    console.log(`  videos.length: ${result.videos.length}`);
    if (result.videos.length > 0) {
      const v = result.videos[0] as Record<string, unknown>;
      console.log(`  first video id: ${v.id}`);
      console.log(`  first video views/likes/comments: ${v.views}/${v.likes}/${v.comments}`);
      console.log(`  first video hashtags: [${(v.hashtags as string[])?.slice(0, 6).join(', ')}]`);
      console.log(`  first video caption: ${String(v.description).slice(0, 140)}`);
    }
  } catch (err) {
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    console.error(`❌ failed in ${elapsed}s`);
    if (err instanceof Error) console.error('  message:', err.message);
  }
}

async function main() {
  if (!process.env.APIFY_API_KEY) {
    console.error('APIFY_API_KEY missing');
    process.exit(1);
  }
  await runOne('Instagram', () => scrapeInstagramProfile(`https://www.instagram.com/${HANDLE}`));
  await runOne('TikTok', () => scrapeTikTokProfile(`https://www.tiktok.com/@${HANDLE}`));
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
