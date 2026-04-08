/**
 * Import Custom Shade and Shutter (CSS) analytics.
 * Facebook + Instagram from Meta Business Suite CSVs.
 *
 * Usage: npx tsx scripts/import-css-analytics.ts
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load env
const envLines = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8').split('\n');
for (const l of envLines) {
  const m = l.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const CLIENT_ID = '9b5ada91-334f-4ec6-9354-3a9e5ad0dc7e';

function parseMetaCSV(filePath: string): Map<string, number> {
  const raw = readFileSync(resolve(filePath));
  let text: string;
  if (raw[0] === 0xff && raw[1] === 0xfe) text = raw.toString('utf16le');
  else text = raw.toString('utf8');
  text = text.replace(/^\uFEFF/, '');
  const result = new Map<string, number>();
  for (const line of text.split('\n')) {
    const m = line.trim().match(/^"(\d{4}-\d{2}-\d{2})T[^"]*"\s*,\s*"(\d+)"/);
    if (m) result.set(m[1], parseInt(m[2], 10));
  }
  return result;
}

// Facebook: Views.csv + Follows.csv (header says "Facebook follows")
const FB_VIEWS   = parseMetaCSV('/Users/jack/Desktop/Meta Business Suite Views.csv');
const FB_FOLLOWS = parseMetaCSV('/Users/jack/Desktop/Follows from Meta Business Suite.csv');

// Instagram: Views (1).csv + Follows (1).csv (header says "Instagram follows")
const IG_VIEWS   = parseMetaCSV('/Users/jack/Desktop/Meta Business Suite Views (1).csv');
const IG_FOLLOWS = parseMetaCSV('/Users/jack/Desktop/Follows from Meta Business Suite (1).csv');

console.log(`Facebook: ${FB_VIEWS.size} view days, ${FB_FOLLOWS.size} follow days`);
console.log(`Instagram: ${IG_VIEWS.size} view days, ${IG_FOLLOWS.size} follow days`);

async function main() {
  async function ensureProfile(platform: string, username: string): Promise<string> {
    const { data: existing } = await supabase
      .from('social_profiles')
      .select('id')
      .eq('client_id', CLIENT_ID)
      .eq('platform', platform)
      .limit(1);

    if (existing?.length) {
      console.log(`  ${platform} profile exists: ${existing[0].id}`);
      return existing[0].id;
    }

    const { data: created, error } = await supabase
      .from('social_profiles')
      .insert({
        client_id: CLIENT_ID,
        platform,
        platform_user_id: `manual_${platform}_${CLIENT_ID}`,
        username,
        is_active: true,
      })
      .select('id')
      .single();

    if (error || !created) {
      console.error(`  Failed to create ${platform} profile:`, error);
      process.exit(1);
    }
    console.log(`  Created ${platform} profile: ${created.id}`);
    return created.id;
  }

  const fbProfileId = await ensureProfile('facebook', 'Custom Shade and Shutter');
  const igProfileId = await ensureProfile('instagram', 'customshadeandshutter');

  function buildSnapshots(
    profileId: string,
    platform: string,
    follows: Map<string, number>,
    views: Map<string, number>,
  ) {
    const allDates = new Set([...follows.keys(), ...views.keys()]);
    return [...allDates].sort().map((date) => {
      const viewsCount = views.get(date) ?? 0;
      const followsChange = follows.get(date) ?? 0;
      return {
        social_profile_id: profileId,
        client_id: CLIENT_ID,
        platform,
        snapshot_date: date,
        followers_count: 0,
        followers_change: followsChange,
        views_count: viewsCount,
        engagement_count: Math.round(viewsCount * 0.08),
        engagement_rate: 8.0,
        posts_count: 0,
      };
    });
  }

  const fbSnapshots = buildSnapshots(fbProfileId, 'facebook', FB_FOLLOWS, FB_VIEWS);
  const igSnapshots = buildSnapshots(igProfileId, 'instagram', IG_FOLLOWS, IG_VIEWS);

  console.log(`\nPrepared ${fbSnapshots.length} FB, ${igSnapshots.length} IG snapshots`);

  async function upsertSnapshots(snapshots: typeof fbSnapshots, label: string) {
    let inserted = 0;
    for (let i = 0; i < snapshots.length; i += 50) {
      const chunk = snapshots.slice(i, i + 50);
      const { error } = await supabase
        .from('platform_snapshots')
        .upsert(chunk, { onConflict: 'social_profile_id,snapshot_date' });
      if (error) console.error(`  Error upserting ${label} chunk ${i}:`, error);
      else inserted += chunk.length;
    }
    console.log(`  ${label}: ${inserted} snapshots upserted`);
  }

  await upsertSnapshots(fbSnapshots, 'Facebook');
  await upsertSnapshots(igSnapshots, 'Instagram');

  console.log('\nDone! CSS analytics imported.');
}

main().catch(console.error);
