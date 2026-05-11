/**
 * Diagnostic: dump Avondale's current connection state + in-flight
 * scheduled posts + their legs, so we can see whether any future post
 * is still short-platform'd.
 *
 * Run: npx tsx scripts/diag-avondale-posts.ts
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
  const nowIso = new Date().toISOString();

  const { data: client } = await admin
    .from('clients')
    .select('id, name, late_profile_id')
    .ilike('name', '%Avondale%')
    .single();
  if (!client) {
    console.log('No Avondale client matched.');
    return;
  }
  console.log(`[client] ${client.name} (${client.id})`);
  console.log(`[late_profile_id] ${client.late_profile_id}`);

  const { data: profiles } = await admin
    .from('social_profiles')
    .select('id, platform, late_account_id, username, is_active, token_status')
    .eq('client_id', client.id);
  console.log(`\n[social_profiles] ${profiles?.length ?? 0} rows`);
  for (const p of profiles ?? []) {
    console.log(
      `  - ${p.platform} @${p.username} late=${p.late_account_id} active=${p.is_active} token=${p.token_status}`,
    );
  }

  const allPlatforms = new Set((profiles ?? []).map((p) => p.platform as string));

  const { data: posts } = await admin
    .from('scheduled_posts')
    .select(
      'id, scheduled_at, status, caption, scheduled_post_platforms(id, status, social_profiles(platform))',
    )
    .eq('client_id', client.id)
    .gte('scheduled_at', nowIso)
    .in('status', ['scheduled', 'pending', 'queued'])
    .order('scheduled_at', { ascending: true });

  console.log(`\n[in-flight posts] ${posts?.length ?? 0}`);
  for (const p of posts ?? []) {
    const legPlatforms = new Set<string>();
    for (const leg of (p.scheduled_post_platforms ?? []) as Array<{
      social_profiles: { platform: string } | null;
    }>) {
      if (leg.social_profiles?.platform) legPlatforms.add(leg.social_profiles.platform);
    }
    const missing = [...allPlatforms].filter((pl) => !legPlatforms.has(pl));
    const when = (p.scheduled_at as string).slice(0, 16).replace('T', ' ');
    const teaser = ((p.caption as string) ?? '').slice(0, 50).replace(/\n/g, ' ');
    console.log(
      `  ${when}  legs:[${[...legPlatforms].join(',')}]${missing.length ? `  MISSING:[${missing.join(',')}]` : ''}  "${teaser}…"`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
