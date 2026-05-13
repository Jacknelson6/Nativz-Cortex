// Resume DSH June drop after the previous run died mid-analyze.
// Picks up the existing drop row and finishes analyze → captions →
// schedule (draft) → mint share link.
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { analyzeDropVideos } from '../lib/calendar/analyze-video';
import { generateDropCaptions } from '../lib/calendar/generate-caption';
import { scheduleDrop } from '../lib/calendar/schedule-drop';
import { mintOrRefreshShareLink } from '../lib/calendar/share-link';
import { eachDay, pickEven } from '../lib/calendar/run-pipeline';
import type { SocialPlatform } from '../lib/posting';

const envPath = existsSync('.env.local') ? '.env.local' : '../../../.env.local';
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const DROP_ID = '6175fd17-e074-4080-a898-2e42d6d0ebde';
const CLIENT_ID = '7d69b3d3-0fc9-4c5f-bd35-a36b47c00d84';
const START = '2026-06-01';
const END = '2026-06-30';
const TIME_CT = '12:00';
const APP_URL = 'https://cortex.nativz.io';

function chicagoWallClockUtc(yyyyMmDd: string, hhmm: string): string {
  const [hh, mm] = hhmm.split(':').map((n) => parseInt(n, 10));
  const utc = new Date(`${yyyyMmDd}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`);
  const chiHour = parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false }).format(utc),
    10,
  );
  return new Date(utc.getTime() + (hh - chiHour) * 60 * 60 * 1000).toISOString();
}

function eachWeekday(start: string, end: string): string[] {
  return eachDay(start, end).filter((d) => {
    const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
    return wd !== 0 && wd !== 6;
  });
}

async function main() {
  const { data: jack } = await admin
    .from('users')
    .select('id, email')
    .ilike('email', 'jack@nativz.io')
    .maybeSingle<{ id: string; email: string | null }>();
  if (!jack) throw new Error('jack user missing');

  const { data: profiles } = await admin
    .from('social_profiles')
    .select('platform')
    .eq('client_id', CLIENT_ID);
  const platforms = ((profiles ?? []) as { platform: string }[]).map((p) => p.platform) as SocialPlatform[];
  console.log(`platforms: ${platforms.join(', ')}`);

  const { data: videos } = await admin
    .from('content_drop_videos')
    .select('id, order_index')
    .eq('drop_id', DROP_ID)
    .order('order_index');
  if (!videos) throw new Error('no videos for drop');
  console.log(`videos in drop: ${videos.length}`);

  const weekdays = eachWeekday(START, END);
  const perVideoDates = pickEven(weekdays, videos.length);
  const overrides: Record<string, string> = {};
  for (const v of videos as { id: string; order_index: number }[]) {
    overrides[v.id] = chicagoWallClockUtc(perVideoDates[v.order_index], TIME_CT);
  }

  console.log('── Analyze (resume) ──');
  const analysis = await analyzeDropVideos(admin, { dropId: DROP_ID, userId: jack.id });
  console.log(`  analyzed=${analysis.analyzed} failed=${analysis.failed}`);

  await admin
    .from('content_drops')
    .update({ status: 'generating', error_detail: analysis.failed > 0 ? `${analysis.failed} analysis failures` : null })
    .eq('id', DROP_ID);

  console.log('── Generate captions ──');
  const captions = await generateDropCaptions(admin, {
    dropId: DROP_ID,
    clientId: CLIENT_ID,
    userId: jack.id,
    userEmail: jack.email ?? '',
  });
  console.log(`  generated=${captions.generated} failed=${captions.failed}`);
  if (captions.generated === 0) {
    await admin.from('content_drops').update({ status: 'failed', error_detail: 'all captions failed' }).eq('id', DROP_ID);
    throw new Error('All caption generations failed');
  }
  await admin
    .from('content_drops')
    .update({ status: 'ready', error_detail: captions.failed > 0 ? `${captions.failed} caption failures` : null })
    .eq('id', DROP_ID);

  console.log('── Schedule (draft) ──');
  const sched = await scheduleDrop(admin, { dropId: DROP_ID, platforms, overrides, draftMode: true });
  console.log(`  scheduled=${sched.scheduled} failed=${sched.failed}`);

  if (sched.scheduled > 0) {
    console.log('── Mint share link ──');
    const { data: scheduledVideos } = await admin
      .from('content_drop_videos')
      .select('scheduled_post_id')
      .eq('drop_id', DROP_ID)
      .not('scheduled_post_id', 'is', null);
    const postIds = (scheduledVideos ?? [])
      .map((v) => v.scheduled_post_id as string | null)
      .filter((p): p is string => typeof p === 'string');

    if (postIds.length > 0) {
      const { data: reviewLinks } = await admin
        .from('post_review_links')
        .insert(postIds.map((postId) => ({ post_id: postId })))
        .select('id, post_id');
      const reviewMap: Record<string, string> = {};
      for (const rl of reviewLinks ?? []) reviewMap[rl.post_id as string] = rl.id as string;

      try {
        const link = await mintOrRefreshShareLink(admin, {
          dropId: DROP_ID,
          clientId: CLIENT_ID,
          postIds,
          reviewMap,
        });
        console.log(`  share URL: ${APP_URL}/s/${link.token}`);
      } catch (err) {
        console.warn(`  share link mint failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  console.log('\ndone.');
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
