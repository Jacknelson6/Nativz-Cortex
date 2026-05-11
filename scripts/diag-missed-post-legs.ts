/**
 * Diagnostic: for each client we just backfilled, list in-flight
 * scheduled_posts (status='scheduled' AND scheduled_at >= now()) that
 * are missing legs for the newly-added platforms.
 *
 * Read-only. Reports per-client what would need a secondary Zernio post
 * created. The decision to actually create the secondary posts is a
 * separate step (we did it manually for National Lenders today).
 *
 * Run: npx tsx scripts/diag-missed-post-legs.ts
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

// (client_id, platforms[]) we just backfilled. Pulled from the
// reconcile-all-zernio-accounts.ts --apply run.
const TARGETS: Array<{ name: string; platforms: string[] }> = [
  { name: 'EcoView', platforms: ['youtube'] },
  { name: 'Goodier Labs', platforms: ['linkedin'] },
  { name: 'Owings Auto', platforms: ['tiktok', 'youtube'] },
  { name: 'Rana Furniture', platforms: ['instagram'] },
];

async function main() {
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  for (const target of TARGETS) {
    const { data: client } = await admin
      .from('clients')
      .select('id, name')
      .ilike('name', target.name)
      .single();
    if (!client) {
      console.log(`\n[${target.name}] no client row matched`);
      continue;
    }

    const { data: profiles } = await admin
      .from('social_profiles')
      .select('id, platform, late_account_id, username')
      .eq('client_id', client.id);
    const allPlatforms = (profiles ?? []).map((p) => p.platform);
    const newlyAdded = target.platforms.filter((p) => allPlatforms.includes(p));

    const { data: posts } = await admin
      .from('scheduled_posts')
      .select(
        'id, scheduled_at, status, caption, scheduled_post_platforms(id, social_profile_id, status, social_profiles(platform))',
      )
      .eq('client_id', client.id)
      .gte('scheduled_at', nowIso)
      .in('status', ['scheduled', 'pending', 'queued'])
      .order('scheduled_at', { ascending: true });

    console.log(`\n[${client.name}] backfilled: ${newlyAdded.join(', ')}`);
    console.log(`  ${posts?.length ?? 0} in-flight posts at or after ${nowIso}`);

    let missingCount = 0;
    for (const p of posts ?? []) {
      const legPlatforms = new Set<string>();
      for (const leg of (p.scheduled_post_platforms ?? []) as Array<{
        social_profiles: { platform: string } | null;
      }>) {
        if (leg.social_profiles?.platform) legPlatforms.add(leg.social_profiles.platform);
      }
      const missing = newlyAdded.filter((pl) => !legPlatforms.has(pl));
      if (missing.length === 0) continue;
      missingCount += 1;
      const when = (p.scheduled_at as string).slice(0, 16).replace('T', ' ');
      const teaser = ((p.caption as string) ?? '').slice(0, 60).replace(/\n/g, ' ');
      console.log(`    - ${when} UTC  needs:[${missing.join(',')}]  "${teaser}…"`);
    }
    console.log(`  ${missingCount} posts need legs added.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
