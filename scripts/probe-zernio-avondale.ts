/**
 * One-shot probe: how many posts does Zernio actually have for Avondale across
 * all platforms? If zero, the caption seeder has nothing to work with and we
 * fall back to a heavier voice instruction in target_audience.
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

async function main() {
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const { getPostingService } = await import('@/lib/posting');
  const admin = createAdminClient();

  const { data: profiles } = await admin
    .from('social_profiles')
    .select('platform, late_account_id, username')
    .eq('client_id', 'fb8a1a10-166c-43e7-bd13-981486095cb4');

  console.log('Avondale social_profiles:');
  for (const p of profiles ?? []) {
    console.log(`  ${p.platform}: account=${p.late_account_id ?? '(none)'}  username=${p.username}`);
  }
  const accounts = new Set(
    (profiles ?? [])
      .map((p) => p.late_account_id)
      .filter((x): x is string => Boolean(x)),
  );

  const service = getPostingService();

  for (const platform of ['facebook', 'instagram', 'tiktok', 'youtube'] as const) {
    const posts = await service.listPosts({ platform, limit: 100 });
    const mine = posts.filter((p) => p.platforms.some((pl) => accounts.has(pl.accountId)));
    console.log(`Zernio ${platform}: ${posts.length} workspace posts, ${mine.length} for Avondale`);
    if (mine.length > 0) {
      for (const p of mine.slice(0, 3)) {
        console.log(`  • [${p.publishedAt ?? p.scheduledFor ?? p.createdAt}] ${p.content.slice(0, 100)}…`);
      }
    }
  }
}

main().catch((err) => {
  console.error('Probe failed:', err);
  process.exit(1);
});
