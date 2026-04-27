/**
 * Scrape a client's TikTok profile via Apify and seed `saved_captions` so
 * future caption generation has a tone anchor to imitate.
 *
 *   npx tsx scripts/seed-saved-captions-from-tiktok.ts <clientId> [tiktokHandle] [count]
 *
 *   clientId      — Cortex client UUID (required)
 *   tiktokHandle  — defaults to `social_profiles.username` for tiktok
 *   count         — how many top captions to keep (default 15)
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

interface ApifyTikTokRow {
  id?: string;
  text?: string; // caption
  hashtags?: { name?: string }[];
  authorMeta?: { name?: string; nickName?: string };
  playCount?: number;
  diggCount?: number;
  webVideoUrl?: string;
  createTime?: number;
}

async function main() {
  const clientId = process.argv[2];
  if (!clientId) {
    console.error('Usage: npx tsx scripts/seed-saved-captions-from-tiktok.ts <clientId> [handle] [count]');
    process.exit(1);
  }
  const handleArg = process.argv[3];
  const count = Number(process.argv[4] ?? '15');

  const apifyKey = process.env.APIFY_API_KEY;
  if (!apifyKey) {
    console.error('✗ APIFY_API_KEY missing in .env.local');
    process.exit(1);
  }

  const { createAdminClient } = await import('@/lib/supabase/admin');
  const admin = createAdminClient();

  // Resolve handle from social_profiles when not supplied.
  let handle = handleArg;
  if (!handle) {
    const { data, error } = await admin
      .from('social_profiles')
      .select('username')
      .eq('client_id', clientId)
      .eq('platform', 'tiktok')
      .maybeSingle();
    if (error || !data?.username) {
      console.error('✗ No TikTok handle on social_profiles for that client. Pass one explicitly.');
      process.exit(1);
    }
    handle = data.username as string;
  }
  handle = handle.replace(/^@/, '').trim();
  console.log(`→ Scraping @${handle} top ${count} posts via Apify`);

  const actorId = 'clockworks~tiktok-profile-scraper';
  const input = {
    profiles: [handle],
    resultsPerPage: Math.max(20, count * 2),
    shouldDownloadCovers: false,
    shouldDownloadVideos: false,
    shouldDownloadSubtitles: false,
    proxyCountryCode: 'None',
  };

  const startRes = await fetch(
    `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/runs?token=${apifyKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  if (!startRes.ok) {
    console.error('✗ Apify actor start failed:', startRes.status, await startRes.text().catch(() => ''));
    process.exit(1);
  }
  const startJson = await startRes.json();
  const runId: string | undefined = startJson?.data?.id;
  const datasetId: string | undefined = startJson?.data?.defaultDatasetId;
  if (!runId || !datasetId) {
    console.error('✗ Apify start response missing runId/datasetId:', startJson);
    process.exit(1);
  }
  console.log(`  ✓ Run started: ${runId}`);

  // Poll until SUCCEEDED.
  const deadline = Date.now() + 180_000;
  let status = 'RUNNING';
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4000));
    const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${apifyKey}`);
    const statusJson = await statusRes.json();
    status = statusJson?.data?.status ?? 'RUNNING';
    process.stdout.write(`  · status: ${status}\r`);
    if (status === 'SUCCEEDED') break;
    if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
      console.error(`\n✗ Apify run ${status}`);
      process.exit(1);
    }
  }
  if (status !== 'SUCCEEDED') {
    console.error('\n✗ Apify run timed out');
    process.exit(1);
  }
  console.log(`\n  ✓ Run finished`);

  // Fetch dataset items.
  const itemsRes = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apifyKey}&format=json&limit=200`,
  );
  if (!itemsRes.ok) {
    console.error('✗ Failed to read dataset:', itemsRes.status);
    process.exit(1);
  }
  const items = (await itemsRes.json()) as ApifyTikTokRow[];
  console.log(`  ✓ ${items.length} posts pulled`);

  // Sort by engagement (plays + likes) and keep posts with non-trivial captions.
  const ranked = [...items]
    .filter((r) => (r.text ?? '').trim().length >= 8)
    .sort(
      (a, b) =>
        (b.playCount ?? 0) + (b.diggCount ?? 0) - ((a.playCount ?? 0) + (a.diggCount ?? 0)),
    )
    .slice(0, count);

  if (ranked.length === 0) {
    console.error('✗ No posts with captions found.');
    process.exit(1);
  }

  // Wipe existing seeded rows for this client so re-runs stay deterministic.
  await admin.from('saved_captions').delete().eq('client_id', clientId);

  const rows = ranked.map((r) => {
    const caption = (r.text ?? '').trim();
    const inlineHashtags = Array.from(caption.matchAll(/#([\p{L}\p{N}_]+)/gu)).map((m) => m[1]);
    const apifyHashtags = (r.hashtags ?? []).map((h) => (h?.name ?? '').replace(/^#/, '')).filter(Boolean);
    const tags = Array.from(new Set([...apifyHashtags, ...inlineHashtags])).slice(0, 30);
    const titleSource = caption.replace(/\s+/g, ' ').slice(0, 60).trim() || `Post ${r.id ?? ''}`;
    return {
      client_id: clientId,
      title: titleSource,
      caption_text: caption,
      hashtags: tags,
    };
  });

  const { error: insertErr } = await admin.from('saved_captions').insert(rows);
  if (insertErr) {
    console.error('✗ Insert failed:', insertErr);
    process.exit(1);
  }

  console.log(`\n✓ Seeded ${rows.length} saved captions for client ${clientId}`);
  for (const r of rows.slice(0, 3)) {
    console.log(`  · "${r.title.slice(0, 60)}…"`);
  }
}

main().catch((err) => {
  console.error('\n✗ Unhandled:', err);
  if (err instanceof Error) console.error(err.stack);
  process.exit(1);
});
