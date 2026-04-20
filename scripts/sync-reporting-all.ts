/**
 * Kick a one-shot sync for every client that has a Zernio-connected social
 * profile. Equivalent to what the twice-daily Vercel cron does, but run on
 * demand so we don't have to wait 12h for the new pipeline to catch up.
 *
 * Usage: npx tsx scripts/sync-reporting-all.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const envLines = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8').split('\n');
for (const l of envLines) {
  const m = l.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

async function main() {
  const { createClient } = await import('@supabase/supabase-js');
  const { syncClientReporting } = await import('../lib/reporting/sync');

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Only sync clients that actually have at least one profile with a Zernio
  // account id — clients with all-null late_account_ids would just fall
  // through sync with 0 results.
  const { data: rows, error } = await sb
    .from('social_profiles')
    .select('client_id, clients(id, name)')
    .not('late_account_id', 'is', null);

  if (error) {
    console.error(error);
    process.exit(1);
  }

  const seen = new Map<string, string>();
  for (const r of rows ?? []) {
    const c = Array.isArray(r.clients) ? r.clients[0] : r.clients;
    if (c?.id && !seen.has(c.id)) seen.set(c.id, c.name);
  }

  const clients = [...seen.entries()].map(([id, name]) => ({ id, name }));
  console.log(`[sync-all] ${clients.length} clients with connected profiles`);

  const start = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString().split('T')[0];
  const end = new Date().toISOString().split('T')[0];

  const summary: Array<{
    name: string;
    synced: boolean;
    platforms: string[];
    posts: number;
    errors: string[];
  }> = [];

  for (const c of clients) {
    process.stdout.write(`[sync] ${c.name}… `);
    try {
      const r = await syncClientReporting(c.id, { start, end });
      console.log(
        r.synced
          ? `ok — ${r.platforms.length} platforms, ${r.postsCount} posts${r.errors.length ? `, ${r.errors.length} errs` : ''}`
          : `no-op${r.errors.length ? ` (${r.errors.length} errs)` : ''}`,
      );
      summary.push({
        name: c.name,
        synced: r.synced,
        platforms: r.platforms,
        posts: r.postsCount,
        errors: r.errors,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`ERR ${msg}`);
      summary.push({ name: c.name, synced: false, platforms: [], posts: 0, errors: [msg] });
    }
  }

  console.log('\n--- summary ---');
  const totalPlatforms = summary.reduce((n, s) => n + s.platforms.length, 0);
  const totalPosts = summary.reduce((n, s) => n + s.posts, 0);
  const totalErrors = summary.reduce((n, s) => n + s.errors.length, 0);
  console.log(
    `${summary.filter((s) => s.synced).length}/${summary.length} synced · ${totalPlatforms} platforms · ${totalPosts} posts · ${totalErrors} errors`,
  );
  const withErrors = summary.filter((s) => s.errors.length > 0);
  if (withErrors.length > 0) {
    console.log('\nErrors by client:');
    for (const s of withErrors) {
      console.log(`  ${s.name}: ${s.errors.join(' | ')}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
