// One-shot: re-normalize hashtags on any scheduled/draft post that has
// invalid chars (hyphens, spaces, accents drop, etc). Run after shipping
// lib/calendar/normalize-hashtag.ts so previously-generated rows match
// the new sanitisation.
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { normalizeHashtagList } from '../lib/calendar/normalize-hashtag';

const envPath = existsSync('.env.local') ? '.env.local' : '../../../.env.local';
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const { data: rows, error } = await admin
    .from('scheduled_posts')
    .select('id, hashtags')
    .in('status', ['draft', 'scheduled', 'pending_approval']);
  if (error) throw error;

  const dirty = (rows ?? [])
    .map((r) => r as { id: string; hashtags: string[] | null })
    .filter((r) => (r.hashtags ?? []).some((t) => /[^a-zA-Z0-9_]/.test(t)));

  console.log(`dirty posts: ${dirty.length}`);

  for (const row of dirty) {
    const before = row.hashtags ?? [];
    const after = normalizeHashtagList(before);
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    const { error: upErr } = await admin
      .from('scheduled_posts')
      .update({ hashtags: after })
      .eq('id', row.id);
    if (upErr) throw upErr;
    console.log(`  ${row.id}`);
    console.log(`    before: ${JSON.stringify(before)}`);
    console.log(`    after:  ${JSON.stringify(after)}`);
  }

  const { data: cdvRows, error: cdvErr } = await admin
    .from('content_drop_videos')
    .select('id, draft_hashtags');
  if (cdvErr) throw cdvErr;

  const dirtyCdv = (cdvRows ?? [])
    .map((r) => r as { id: string; draft_hashtags: string[] | null })
    .filter((r) => (r.draft_hashtags ?? []).some((t) => /[^a-zA-Z0-9_]/.test(t)));

  console.log(`dirty draft videos: ${dirtyCdv.length}`);
  for (const row of dirtyCdv) {
    const before = row.draft_hashtags ?? [];
    const after = normalizeHashtagList(before);
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    const { error: upErr } = await admin
      .from('content_drop_videos')
      .update({ draft_hashtags: after })
      .eq('id', row.id);
    if (upErr) throw upErr;
    console.log(`  ${row.id}`);
  }

  console.log('done');
}

main().then(() => process.exit(0));
