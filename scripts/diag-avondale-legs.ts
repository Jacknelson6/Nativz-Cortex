/**
 * Inspect Avondale's existing scheduled_post_platforms rows to find
 * "zombie" legs — legs that point at the broken IG/YT social_profiles
 * and therefore never actually published on Zernio. We need to know
 * the shape (status + external_post_id) before deciding whether to
 * delete them or just leave them.
 *
 * Run: npx tsx scripts/diag-avondale-legs.ts
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

  const CLIENT = 'fb8a1a10-166c-43e7-bd13-981486095cb4';

  const { data: profiles } = await admin
    .from('social_profiles')
    .select('id, platform, late_account_id, username, is_active')
    .eq('client_id', CLIENT);
  const idToProfile = new Map<string, { platform: string; late: string | null; username: string }>();
  for (const p of profiles ?? []) {
    idToProfile.set(p.id as string, {
      platform: p.platform as string,
      late: (p.late_account_id as string | null) ?? null,
      username: (p.username as string) ?? '',
    });
  }

  const { data: posts } = await admin
    .from('scheduled_posts')
    .select('id, scheduled_at')
    .eq('client_id', CLIENT)
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true });

  for (const p of posts ?? []) {
    const { data: legs } = await admin
      .from('scheduled_post_platforms')
      .select('id, social_profile_id, status, external_post_id, external_post_url')
      .eq('post_id', p.id);
    const when = (p.scheduled_at as string).slice(0, 16).replace('T', ' ');
    console.log(`\n[${when}] post=${p.id}`);
    for (const leg of legs ?? []) {
      const prof = idToProfile.get(leg.social_profile_id as string);
      const tag = prof ? `${prof.platform} @${prof.username}${prof.late ? '' : ' (BROKEN: no late_account_id)'}` : 'UNKNOWN';
      console.log(
        `  - ${tag}  status=${leg.status} ext=${leg.external_post_id ?? '-'}`,
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
