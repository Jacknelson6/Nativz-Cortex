// Continue the Nativz June pipeline: drop is already ingested + analyzed
// + captioned; just schedule (draft) + mint share link. Then bump the
// first post to May 15.
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { scheduleDrop } from '../lib/calendar/schedule-drop';
import { mintOrRefreshShareLink } from '../lib/calendar/share-link';

const envPath = existsSync('.env.local') ? '.env.local' : '../../../.env.local';
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const CLIENT_ID = 'c0d11d52-e567-48ed-a5ab-7da0b55d6b8b';
const DROP_ID = '1bb67082-deb4-4696-98ed-0eed7155b1c9';
const APP_URL = 'https://cortex.nativz.io';
const FIRST_POST_DATE_CT = '2026-05-15';
const TIME_CT = '12:00';

function wallClockUtc(yyyyMmDd: string, hhmm: string, timeZone: string): string {
  const [hh, mm] = hhmm.split(':').map((n) => parseInt(n, 10));
  const naive = new Date(
    `${yyyyMmDd}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`,
  );
  const tzHour = parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: false }).format(naive),
    10,
  );
  return new Date(naive.getTime() + (hh - tzHour) * 60 * 60 * 1000).toISOString();
}

async function main() {
  const { data: profiles } = await admin
    .from('social_profiles')
    .select('platform')
    .eq('client_id', CLIENT_ID);
  const platforms = ((profiles ?? []) as { platform: string }[]).map(
    (p) => p.platform,
  ) as Parameters<typeof scheduleDrop>[1]['platforms'];
  console.log(`platforms: ${platforms.join(', ')}`);

  console.log('scheduling...');
  const sched = await scheduleDrop(admin, {
    dropId: DROP_ID,
    platforms,
    draftMode: true,
  });
  console.log(`scheduled=${sched.scheduled} failed=${sched.failed}`);
  if (sched.errors.length) console.log('errors:', sched.errors);

  // Mint share link
  const { data: scheduledVideos } = await admin
    .from('content_drop_videos')
    .select('scheduled_post_id')
    .eq('drop_id', DROP_ID)
    .not('scheduled_post_id', 'is', null);
  const postIds = (scheduledVideos ?? [])
    .map((v) => v.scheduled_post_id as string | null)
    .filter((p): p is string => typeof p === 'string');
  console.log(`post ids: ${postIds.length}`);

  const { data: reviewLinks } = await admin
    .from('post_review_links')
    .insert(postIds.map((post_id) => ({ post_id })))
    .select('id, post_id');
  const reviewMap: Record<string, string> = {};
  for (const rl of reviewLinks ?? []) reviewMap[rl.post_id as string] = rl.id as string;

  const link = await mintOrRefreshShareLink(admin, {
    dropId: DROP_ID,
    clientId: CLIENT_ID,
    postIds,
    reviewMap,
  });
  console.log(`URL: ${APP_URL}/s/${link.token}`);

  // Move first post (lowest scheduled_at) to May 15 12pm CT.
  const { data: posts } = await admin
    .from('scheduled_posts')
    .select('id, scheduled_at')
    .in('id', postIds)
    .order('scheduled_at', { ascending: true });
  const first = posts?.[0] as { id: string; scheduled_at: string } | undefined;
  if (first) {
    const newAt = wallClockUtc(FIRST_POST_DATE_CT, TIME_CT, 'America/Chicago');
    await admin
      .from('scheduled_posts')
      .update({ scheduled_at: newAt })
      .eq('id', first.id);
    console.log(`moved first post ${first.id} to ${FIRST_POST_DATE_CT} ${TIME_CT} CT`);
  }

  // Refresh drop date range to include May 15.
  const { data: refreshed } = await admin
    .from('scheduled_posts')
    .select('scheduled_at')
    .in('id', postIds);
  const dates = ((refreshed ?? []) as { scheduled_at: string }[])
    .map((r) => r.scheduled_at.slice(0, 10))
    .sort();
  if (dates.length > 0) {
    await admin
      .from('content_drops')
      .update({ start_date: dates[0], end_date: dates[dates.length - 1] })
      .eq('id', DROP_ID);
    console.log(`drop date range: ${dates[0]} → ${dates[dates.length - 1]}`);
  }
}

main().then(() => process.exit(0));
