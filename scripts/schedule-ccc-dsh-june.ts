// One-shot: ingest Crystal Creek Cattle + Dunston's Steakhouse June Drive
// folders, run the full pipeline (download → Mux → analyze → captions →
// scheduled_posts), and mint share links. Draft mode — nothing publishes
// until the client approves via the share link.
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

const TARGETS = [
  {
    label: 'Crystal Creek Cattle June',
    clientId: 'dfb1b47c-a045-425e-9379-80b5675cc796',
    folderUrl: 'https://drive.google.com/drive/folders/1GaNMJGf82TGr7keBIX_DgHbA436bmJPS',
  },
  {
    label: "Dunston's Steakhouse June",
    clientId: '7d69b3d3-0fc9-4c5f-bd35-a36b47c00d84',
    folderUrl: 'https://drive.google.com/drive/folders/1Sfjt6JwBZROkNimutnXcqxPaymhpUhRM',
  },
];

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

async function runTarget(jack: { id: string; email: string | null }, t: typeof TARGETS[number]) {
  console.log(`\n========== ${t.label} ==========`);

  const { data: profiles } = await admin
    .from('social_profiles')
    .select('platform')
    .eq('client_id', t.clientId);
  const platforms = ((profiles ?? []) as { platform: string }[]).map(
    (p) => p.platform,
  ) as Parameters<typeof runCalendarPipeline>[1]['platforms'];
  console.log(`platforms: ${platforms.join(', ')}`);

  console.log(`listing drive folder...`);
  const list = await listMediaInFolder(jack.id, t.folderUrl, 'video');
  const videos = list.files
    .filter((v) => v.size > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
  console.log(`videos in folder: ${videos.length}`);
  if (videos.length === 0) {
    console.log(`SKIP ${t.label}: no videos in folder`);
    return;
  }

  const weekdays = eachWeekday(START, END);
  console.log(`weekdays in ${START}..${END}: ${weekdays.length}`);
  if (weekdays.length < videos.length) {
    throw new Error(`only ${weekdays.length} weekdays for ${videos.length} videos`);
  }
  const perVideoDates = pickEven(weekdays, videos.length);
  console.log(`dates: ${perVideoDates.join(', ')}`);

  const result = await runCalendarPipeline(admin, {
    label: t.label,
    folderUrl: t.folderUrl,
    videos,
    perVideoDates,
    defaultPostTimeCt: TIME_CT,
    startDate: START,
    endDate: END,
    platforms,
    mintShareLink: true,
    draftMode: true,
    appUrl: APP_URL,
    clientId: t.clientId,
    userId: jack.id,
    userEmail: jack.email ?? '',
  });

  console.log(`\n--- ${t.label} result ---`);
  console.log(`drop: ${result.dropId ?? '(none)'}`);
  console.log(`scheduled: ${result.scheduled}  failed: ${result.failed}`);
  if (result.shareUrl) console.log(`URL: ${result.shareUrl}`);
  if (result.error) console.log(`ERR: ${result.error}`);
}

async function main() {
  const { data: jack } = await admin
    .from('users')
    .select('id, email')
    .ilike('email', 'jack@nativz.io')
    .maybeSingle<{ id: string; email: string | null }>();
  if (!jack) throw new Error('jack user missing');

  for (const t of TARGETS) {
    try {
      await runTarget(jack, t);
    } catch (err) {
      console.error(`FAILED ${t.label}:`, err instanceof Error ? err.message : err);
    }
  }
}

main().then(() => process.exit(0));
