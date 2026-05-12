// One-shot: ingest Hartley Law's June Drive folder, run the full
// pipeline (download → Mux → analyze → captions → schedule_posts),
// and mint a share link. Draft mode — nothing publishes until
// client approves via the share link.
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { listMediaInFolder } from '../lib/calendar/drive-folder';
import { runCalendarPipeline, eachDay, pickEven } from '../lib/calendar/run-pipeline';

const envPath = existsSync('.env.local') ? '.env.local' : '../../../.env.local';
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const CLIENT_ID = '70f721e1-1f74-42d8-b7fd-9805e851f10b';
const FOLDER_URL =
  'https://drive.google.com/drive/folders/1xihaW40IcUGnv43t9C2Z21osT8xR_erC';
const START = '2026-06-01';
const END = '2026-06-30';
const TIME_CT = '12:00';
const APP_URL = 'https://cortex.nativz.io';

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
    .maybeSingle<{ id: string; email: string }>();
  if (!jack) throw new Error('jack user missing');

  const { data: profiles } = await admin
    .from('social_profiles')
    .select('platform')
    .eq('client_id', CLIENT_ID);
  const platforms = ((profiles ?? []) as { platform: string }[]).map(
    (p) => p.platform,
  ) as Parameters<typeof runCalendarPipeline>[1]['platforms'];
  console.log(`platforms: ${platforms.join(', ')}`);

  console.log(`listing drive folder...`);
  const list = await listMediaInFolder(jack.id, FOLDER_URL, 'video');
  const videos = list.files
    .filter((v) => v.size > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
  console.log(`videos in folder: ${videos.length}`);
  if (videos.length === 0) throw new Error('no videos in folder');

  const weekdays = eachWeekday(START, END);
  console.log(`weekdays in ${START}..${END}: ${weekdays.length}`);
  if (weekdays.length < videos.length) {
    throw new Error(`only ${weekdays.length} weekdays for ${videos.length} videos`);
  }
  const perVideoDates = pickEven(weekdays, videos.length);
  console.log(`dates: ${perVideoDates.join(', ')}`);

  const result = await runCalendarPipeline(admin, {
    label: 'Hartley Law June',
    folderUrl: FOLDER_URL,
    videos,
    perVideoDates,
    defaultPostTimeCt: TIME_CT,
    startDate: START,
    endDate: END,
    platforms,
    mintShareLink: true,
    draftMode: true,
    appUrl: APP_URL,
    clientId: CLIENT_ID,
    userId: jack.id,
    userEmail: jack.email ?? '',
  });

  console.log('\n=== result ===');
  console.log(`drop: ${result.dropId ?? '(none)'}`);
  console.log(`scheduled: ${result.scheduled}  failed: ${result.failed}`);
  if (result.shareUrl) console.log(`URL: ${result.shareUrl}`);
  if (result.error) console.log(`ERR: ${result.error}`);
}

main().then(() => process.exit(0));
