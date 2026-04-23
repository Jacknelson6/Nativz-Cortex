import { createAdminClient } from '@/lib/supabase/admin';

async function main() {
  const apiKey = process.env.APIFY_API_KEY?.trim();
  if (!apiKey) throw new Error('APIFY_API_KEY missing');

  const supabase = createAdminClient();
  const { data: runs } = await supabase
    .from('apify_runs')
    .select('run_id')
    .eq('purpose', 'web_serp')
    .eq('status', 'SUCCEEDED')
    .order('started_at', { ascending: false })
    .limit(1);

  const runId = runs?.[0]?.run_id;
  if (!runId) throw new Error('no successful serp run');

  console.log('Inspecting:', runId);
  const res = await fetch(
    `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${apiKey}&limit=200`,
  );
  const items = await res.json();
  console.log('items:', items.length);
  for (const [i, item] of (items as Record<string, unknown>[]).entries()) {
    console.log(`\n--- item ${i} keys: ${Object.keys(item).join(', ')}`);
    // Print first 2000 chars of the item so we can see the shape.
    console.log(JSON.stringify(item, null, 2).slice(0, 2500));
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
