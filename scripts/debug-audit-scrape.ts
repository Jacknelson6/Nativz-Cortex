/**
 * Audit scraper diagnostic. Three separate investigations rolled in:
 *
 * 1. Real scraper outputs — verify IG + TikTok return profile + videos via
 *    the wrappers already shipped (smoke test).
 * 2. TikTok avatar fetch — take the raw avatar URL the actor returns and
 *    hit it server-side to see if the persist-scraped-images helper can
 *    actually mirror it. Tries a couple of header variants because
 *    tiktokcdn-us sometimes 403s without a Referer.
 * 3. Facebook actor shootout — fire three candidate actors against the
 *    same FB page, dump a summary of each result so we can pick one that
 *    actually returns posts + engagement + profile picture.
 *
 * Usage:
 *   env $(grep -v '^#' .env.local | grep APIFY_API_KEY | xargs) npx tsx scripts/debug-audit-scrape.ts
 *   HANDLE=someotherbrand env $(...) npx tsx scripts/debug-audit-scrape.ts
 *   FB_PAGE=https://facebook.com/toastiquedc env $(...) npx tsx scripts/debug-audit-scrape.ts
 */

import { scrapeInstagramProfile } from '../lib/audit/scrape-instagram-profile';
import { scrapeTikTokProfile } from '../lib/audit/scrape-tiktok-profile';

const HANDLE = process.env.HANDLE ?? 'toastique';
const FB_PAGE = process.env.FB_PAGE ?? 'https://www.facebook.com/toastiquedc';
const APIFY_KEY = process.env.APIFY_API_KEY;

if (!APIFY_KEY) {
  console.error('APIFY_API_KEY missing');
  process.exit(1);
}

async function runScraperSmoke(label: string, fn: () => Promise<{ profile: Record<string, unknown>; videos: unknown[] }>) {
  console.log(`\n=== ${label} @${HANDLE} ===`);
  try {
    const result = await fn();
    const p = result.profile;
    console.log(`  followers: ${p.followers}  videos: ${result.videos.length}`);
    console.log(`  avatarUrl: ${p.avatarUrl ?? '(null)'}`);
    return p.avatarUrl as string | null;
  } catch (err) {
    console.error('  failed:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

async function testAvatarFetch(label: string, url: string | null) {
  console.log(`\n=== Avatar fetch: ${label} ===`);
  if (!url) {
    console.log('  (no avatar URL)');
    return;
  }
  const attempts: Array<{ label: string; headers: Record<string, string> }> = [
    { label: 'plain', headers: {} },
    { label: 'Mozilla UA only', headers: { 'User-Agent': 'Mozilla/5.0' } },
    {
      label: 'full browser UA + referer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: 'https://www.tiktok.com/',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
    },
  ];
  for (const attempt of attempts) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: attempt.headers });
      const size = res.ok ? (await res.arrayBuffer()).byteLength : 0;
      console.log(`  ${attempt.label.padEnd(28)} status=${res.status}  bytes=${size}  content-type=${res.headers.get('content-type') ?? '(?)'}`);
      if (res.ok && size > 0) return;
    } catch (e) {
      console.log(`  ${attempt.label.padEnd(28)} THREW ${e instanceof Error ? e.message : e}`);
    }
  }
}

interface ApifyRun {
  id?: string;
  status?: string;
  statusMessage?: string | null;
  defaultDatasetId?: string;
}

async function apifyRun(actorId: string, input: Record<string, unknown>): Promise<{ items: unknown[]; run: ApifyRun | null }> {
  const startRes = await fetch(`https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/runs?token=${APIFY_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!startRes.ok) {
    console.log(`  ❌ start failed: ${startRes.status} ${await startRes.text().catch(() => '')}`);
    return { items: [], run: null };
  }
  const startData = await startRes.json();
  const runId = startData?.data?.id as string | undefined;
  if (!runId) return { items: [], run: null };
  console.log(`  runId=${runId}`);

  // Poll
  const maxWait = 4 * 60 * 1000;
  const start = Date.now();
  let run: ApifyRun | null = null;
  while (Date.now() - start < maxWait) {
    await new Promise((r) => setTimeout(r, 3000));
    const res = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_KEY}`);
    if (!res.ok) continue;
    const data = await res.json();
    const status = data?.data?.status as string | undefined;
    if (status === 'SUCCEEDED' || status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
      run = data?.data;
      break;
    }
  }
  if (!run) {
    console.log('  ❌ did not reach terminal status');
    return { items: [], run: null };
  }
  console.log(`  status=${run.status}  statusMessage=${run.statusMessage ?? '(none)'}`);
  if (run.status !== 'SUCCEEDED' || !run.defaultDatasetId) return { items: [], run };

  const dsRes = await fetch(`https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?token=${APIFY_KEY}&limit=10`);
  if (!dsRes.ok) return { items: [], run };
  const items = await dsRes.json();
  return { items: Array.isArray(items) ? items : [], run };
}

function summarizeFbItem(item: unknown, idx: number) {
  const obj = item as Record<string, unknown>;
  const topKeys = Object.keys(obj).slice(0, 18).join(', ');
  console.log(`  item[${idx}] keys: ${topKeys}${Object.keys(obj).length > 18 ? ', …' : ''}`);
  // Surface any error payload first so we know WHY bad actors are failing.
  if (obj.error || obj.errorDescription) {
    console.log(`    ERROR: ${String(obj.error ?? '')} — ${String(obj.errorDescription ?? '').slice(0, 200)}`);
  }
  const probe = {
    pageName: obj.pageName ?? obj.name ?? obj.pageTitle ?? obj.title,
    profilePic: obj.pageProfilePicUrl ?? obj.profilePicture ?? obj.profilePicUrl ?? obj.pictureUrl ?? obj.profile_pic_url ?? obj.avatar,
    followers: obj.pageFollowers ?? obj.followersCount ?? obj.followers ?? obj.likes ?? obj.follows,
    likes: obj.likesCount ?? obj.likes ?? obj.reactions ?? obj.reactionsCount,
    comments: obj.commentsCount ?? obj.comments,
    shares: obj.sharesCount ?? obj.shares,
    text: obj.postText ?? obj.text ?? obj.message ?? obj.description ?? obj.caption,
    image: obj.fullPicture ?? obj.imageUrl ?? obj.image ?? obj.thumbnail,
    postUrl: obj.postUrl ?? obj.url,
    time: obj.time ?? obj.date ?? obj.createdTime ?? obj.publishedAt ?? obj.timestamp,
    views: obj.videoViews ?? obj.videoViewCount ?? obj.views,
  };
  const summary = Object.entries(probe)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => {
      const s = typeof v === 'string' ? v.slice(0, 60) : String(v);
      return `${k}=${s}`;
    })
    .join('  ');
  console.log(`    ${summary || '(no interesting fields)'}`);
}

async function testFacebookActors() {
  console.log(`\n=== Facebook actors — testing against ${FB_PAGE} ===`);

  const candidates: Array<{ actor: string; input: Record<string, unknown> }> = [
    // apidojo actors are what IG + TikTok already use successfully, try their FB flavors
    {
      actor: 'apidojo/facebook-pages-scraper',
      input: { startUrls: [{ url: FB_PAGE }] },
    },
    {
      actor: 'apidojo/facebook-posts-scraper',
      input: { startUrls: [{ url: FB_PAGE }], resultsLimit: 10 },
    },
    // Current in-use actor — re-test with different input shape
    {
      actor: 'apify/facebook-posts-scraper',
      input: {
        startUrls: [{ url: FB_PAGE }],
        resultsLimit: 10,
        onlyPostsNewerThan: '60 days',
      },
    },
    // Community actor — commonly referenced as a working fallback
    {
      actor: 'easyapi/facebook-posts-scraper',
      input: { startUrls: [{ url: FB_PAGE }], resultsLimit: 10 },
    },
  ];

  for (const c of candidates) {
    console.log(`\n--- ${c.actor} ---`);
    const start = Date.now();
    const { items, run } = await apifyRun(c.actor, c.input);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`  ${items.length} items in ${elapsed}s  (status: ${run?.status ?? 'unknown'})`);
    if (items.length > 0) {
      summarizeFbItem(items[0], 0);
      if (items.length > 1) summarizeFbItem(items[1], 1);
    }
  }
}

async function main() {
  console.log(`Diagnosing audit scrapers against @${HANDLE}`);
  console.log(`APIFY_API_KEY length=${APIFY_KEY.length}`);

  const igAvatar = await runScraperSmoke('Instagram', () => scrapeInstagramProfile(`https://www.instagram.com/${HANDLE}`));
  const ttAvatar = await runScraperSmoke('TikTok', () => scrapeTikTokProfile(`https://www.tiktok.com/@${HANDLE}`));

  await testAvatarFetch('TikTok avatar', ttAvatar);
  await testAvatarFetch('Instagram avatar', igAvatar);

  await testFacebookActors();
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
