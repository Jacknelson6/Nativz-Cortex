/**
 * Dump the first post + first comment from the most recent trudax run to
 * check field names. Run: node --env-file=.env.local --import tsx scripts/inspect-trudax-dataset.ts
 */

import { createAdminClient } from '@/lib/supabase/admin';

async function main() {
  const apiKey = process.env.APIFY_API_KEY?.trim();
  if (!apiKey) throw new Error('APIFY_API_KEY missing');

  const supabase = createAdminClient();
  const { data: runs } = await supabase
    .from('apify_runs')
    .select('run_id')
    .eq('actor_id', 'trudax/reddit-scraper-lite')
    .order('started_at', { ascending: false })
    .limit(1);

  const runId = runs?.[0]?.run_id;
  if (!runId) throw new Error('no run to inspect');

  console.log('Inspecting run:', runId);

  const res = await fetch(
    `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${apiKey}&limit=200`,
  );
  const items = (await res.json()) as Record<string, unknown>[];
  console.log(`Dataset size: ${items.length}`);

  const posts = items.filter((x) => String(x.dataType ?? '').toLowerCase() === 'post' || (typeof x.title === 'string' && x.title));
  const comments = items.filter((x) => String(x.dataType ?? '').toLowerCase() === 'comment' || (x.body && !x.title));

  console.log(`\nposts detected: ${posts.length}`);
  console.log(`comments detected: ${comments.length}`);

  if (posts[0]) {
    console.log('\n--- POST SAMPLE (keys + small preview) ---');
    console.log(JSON.stringify(Object.keys(posts[0]), null, 2));
    console.log('\nSample values:');
    for (const k of Object.keys(posts[0])) {
      const v = (posts[0] as Record<string, unknown>)[k];
      const short = typeof v === 'string' ? v.slice(0, 80) : v;
      console.log(`  ${k}: ${JSON.stringify(short)}`);
    }
  }

  if (comments[0]) {
    console.log('\n--- COMMENT SAMPLE (keys + small preview) ---');
    console.log(JSON.stringify(Object.keys(comments[0]), null, 2));
    console.log('\nSample values:');
    for (const k of Object.keys(comments[0])) {
      const v = (comments[0] as Record<string, unknown>)[k];
      const short = typeof v === 'string' ? v.slice(0, 80) : v;
      console.log(`  ${k}: ${JSON.stringify(short)}`);
    }
  } else {
    console.log('\n--- No comments in dataset. Showing last 3 non-post rows ---');
    const nonPosts = items.filter((x) => !(typeof x.title === 'string' && x.title));
    console.log(`non-post count: ${nonPosts.length}`);
    for (const row of nonPosts.slice(0, 3)) {
      console.log('\n  keys:', Object.keys(row));
      console.log('  dataType:', row.dataType);
      console.log('  body preview:', typeof row.body === 'string' ? row.body.slice(0, 80) : row.body);
    }
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
