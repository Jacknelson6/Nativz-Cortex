/**
 * Smoke test: Apify scraperlink Google SERP path end-to-end.
 * Run: node --env-file=.env.local --import tsx scripts/test-web-serp.ts [query] [timeRange] [limit]
 */

import { gatherSerpData } from '@/lib/serp/client';
import { createAdminClient } from '@/lib/supabase/admin';

async function main() {
  const query = process.argv[2] || 'new orleans things to do';
  const timeRange = process.argv[3] || 'last_30_days';
  const limit = Number(process.argv[4] ?? '30');

  console.log('\n=== Web SERP smoke test ===');
  console.log(`query:     ${query}`);
  console.log(`timeRange: ${timeRange}`);
  console.log(`limit:     ${limit}`);

  const t0 = Date.now();
  const result = await gatherSerpData(query, { timeRange, limit });
  const duration = Date.now() - t0;

  console.log(`\n--- ${result.webResults.length} results (${duration}ms) ---`);
  for (const [i, r] of result.webResults.slice(0, 10).entries()) {
    console.log(`\n  ${i + 1}. ${r.title}`);
    console.log(`     ${r.url}`);
    if (r.description) console.log(`     ${r.description.slice(0, 120)}${r.description.length > 120 ? '...' : ''}`);
  }

  const supabase = createAdminClient();
  const { data: runs } = await supabase
    .from('apify_runs')
    .select('run_id, actor_id, purpose, status, cost_usd, compute_units, dataset_items, duration_ms')
    .eq('purpose', 'web_serp')
    .order('started_at', { ascending: false })
    .limit(1);
  console.log('\n--- latest apify_runs row for purpose=web_serp ---');
  console.log(runs?.[0] ? JSON.stringify(runs[0], null, 2) : 'no row yet');
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
