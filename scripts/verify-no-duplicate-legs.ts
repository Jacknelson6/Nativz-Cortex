/**
 * After running backfill-missing-post-legs.ts, sanity-check that no
 * scheduled_post has two legs pointing at the same (client, platform)
 * pair. Two legs on the same platform per post means the same content
 * would publish twice, which is exactly what we want to avoid.
 *
 * Run: npx tsx scripts/verify-no-duplicate-legs.ts
 */
import fs from 'node:fs';
import path from 'node:path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

async function main() {
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const admin = createAdminClient();

  // Look at every in-flight post for the three clients we touched.
  const NAMES = ['National Lenders', 'EcoView', 'Owings Auto', 'Avondale Private Lending'];
  const { data: clients } = await admin
    .from('clients')
    .select('id, name')
    .in('name', NAMES);

  for (const c of clients ?? []) {
    const { data: posts } = await admin
      .from('scheduled_posts')
      .select(
        'id, scheduled_at, scheduled_post_platforms(id, status, social_profiles(platform))',
      )
      .eq('client_id', c.id)
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true });

    console.log(`\n[${c.name}] ${posts?.length ?? 0} in-flight posts`);
    let anyDup = false;
    for (const post of posts ?? []) {
      const counts = new Map<string, number>();
      const legs = (post.scheduled_post_platforms ?? []) as Array<{
        social_profiles: { platform: string } | null;
      }>;
      for (const leg of legs) {
        const p = leg.social_profiles?.platform;
        if (!p) continue;
        counts.set(p, (counts.get(p) ?? 0) + 1);
      }
      const dups = [...counts.entries()].filter(([, n]) => n > 1);
      const when = (post.scheduled_at as string).slice(0, 16).replace('T', ' ');
      const all = [...counts.entries()]
        .map(([p, n]) => `${p}×${n}`)
        .join(', ');
      if (dups.length > 0) {
        anyDup = true;
        console.log(`  ${when}  DUPLICATE: ${dups.map(([p, n]) => `${p}×${n}`).join(', ')}  (all: ${all})`);
      } else {
        console.log(`  ${when}  ok  legs:[${all}]`);
      }
    }
    if (!anyDup) console.log(`  (no duplicates)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
