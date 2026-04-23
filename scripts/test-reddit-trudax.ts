/**
 * Smoke-test the new trudax/reddit-scraper-lite path end-to-end.
 * Run with: npx tsx scripts/test-reddit-trudax.ts [query] [volume] [timeRange]
 *
 * Verifies:
 *   1. Actor starts (schema accepted)
 *   2. Parser extracts posts + inline comments
 *   3. A row lands in apify_runs with cost attribution
 */

import { gatherRedditData } from '@/lib/reddit/client';
import { createAdminClient } from '@/lib/supabase/admin';

async function main() {
  const query = process.argv[2] || 'new orleans things to do';
  const volume = (process.argv[3] as 'light' | 'medium' | 'deep') || 'light';
  const timeRange = process.argv[4] || 'last_30_days';

  console.log('\n=== Reddit trudax smoke test ===');
  console.log(`query:      ${query}`);
  console.log(`volume:     ${volume}`);
  console.log(`timeRange:  ${timeRange}`);
  console.log('');

  const t0 = Date.now();
  const result = await gatherRedditData(query, timeRange, volume, {
    topicSearchId: null,
    clientId: null,
  });
  const duration = Date.now() - t0;

  console.log(`\n--- result (${duration}ms) ---`);
  console.log(`posts:          ${result.totalPosts}`);
  console.log(`top subreddits: ${result.topSubreddits.slice(0, 10).join(', ') || 'none'}`);

  if (result.postsWithComments.length === 0) {
    console.log('\nNo posts returned. Check Apify run logs for the actor.');
  } else {
    console.log('\n--- top 5 posts ---');
    for (const p of result.postsWithComments.slice(0, 5)) {
      const age = p.created_utc
        ? `${Math.round((Date.now() / 1000 - p.created_utc) / 86400)}d ago`
        : 'unknown';
      console.log(`\n  [r/${p.subreddit}] ${p.title}`);
      console.log(`  ↑${p.score}  💬${p.num_comments}  · ${age}`);
      console.log(`  ${p.url}`);
      if (p.selftext) console.log(`  Body: ${p.selftext.slice(0, 120)}${p.selftext.length > 120 ? '...' : ''}`);
      if (p.top_comments.length > 0) {
        console.log(`  Top comment (${p.top_comments[0].score} ups): "${p.top_comments[0].body.slice(0, 100)}${p.top_comments[0].body.length > 100 ? '...' : ''}"`);
      } else {
        console.log(`  [no inline comments]`);
      }
    }
  }

  // Check that cost row landed in apify_runs
  const supabase = createAdminClient();
  const { data: runs, error } = await supabase
    .from('apify_runs')
    .select('run_id, actor_id, purpose, status, cost_usd, compute_units, dataset_items, duration_ms, started_at')
    .eq('purpose', 'reddit')
    .order('started_at', { ascending: false })
    .limit(1);

  console.log('\n--- latest apify_runs row for purpose=reddit ---');
  if (error) console.log('err:', error.message);
  else if (!runs || runs.length === 0) console.log('no row yet (may still be writing)');
  else console.log(JSON.stringify(runs[0], null, 2));

  process.exit(0);
}

main().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
