/**
 * List every in-flight scheduled post across the four clients we
 * touched today, sorted by scheduled time, with the platform legs
 * each post will publish to. Read-only.
 *
 * Run: npx tsx scripts/list-all-scheduled.ts
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

const NAMES = [
  'National Lenders',
  'EcoView',
  'Owings Auto',
  'Avondale Private Lending',
];

function utcToCdt(iso: string): string {
  // CDT is UTC-5. Quick mechanical shift so the user sees local
  // posting time without pulling in tz libraries.
  const d = new Date(iso);
  const shifted = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 16).replace('T', ' ');
}

async function main() {
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const admin = createAdminClient();

  const { data: clients } = await admin
    .from('clients')
    .select('id, name')
    .in('name', NAMES);

  type Row = {
    when: string;
    cdt: string;
    client: string;
    status: string;
    platforms: string[];
    teaser: string;
  };
  const rows: Row[] = [];

  for (const c of clients ?? []) {
    const { data: posts } = await admin
      .from('scheduled_posts')
      .select(
        'id, scheduled_at, status, caption, scheduled_post_platforms(social_profiles(platform))',
      )
      .eq('client_id', c.id)
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true });

    for (const p of posts ?? []) {
      const legs = new Set<string>();
      for (const leg of (p.scheduled_post_platforms ?? []) as Array<{
        social_profiles: { platform: string } | null;
      }>) {
        if (leg.social_profiles?.platform) legs.add(leg.social_profiles.platform);
      }
      rows.push({
        when: (p.scheduled_at as string).slice(0, 16).replace('T', ' '),
        cdt: utcToCdt(p.scheduled_at as string),
        client: c.name as string,
        status: p.status as string,
        platforms: [...legs].sort(),
        teaser: ((p.caption as string) ?? '').slice(0, 55).replace(/\n/g, ' '),
      });
    }
  }

  rows.sort((a, b) => a.when.localeCompare(b.when));

  const PAD_CLIENT = Math.max(...rows.map((r) => r.client.length));
  const PAD_STATUS = Math.max(...rows.map((r) => r.status.length));

  for (const r of rows) {
    console.log(
      `${r.when} UTC  ${r.cdt} CDT  ${r.client.padEnd(PAD_CLIENT)}  ${r.status.padEnd(PAD_STATUS)}  [${r.platforms.join(', ')}]  "${r.teaser}…"`,
    );
  }
  console.log(`\n${rows.length} posts total.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
