// Move Rana Furniture's May Calendar 12 draft posts onto evenly spread
// weekdays from May 25 → Jun 30 (inclusive).
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';

const envPath = existsSync('.env.local') ? '.env.local' : '../../../.env.local';
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const PROJECT_ID = '3a3f6c92-dce3-471e-b23b-84d8d53935ee';
const CLIENT_ID = '81584bba-5331-4a38-8a92-82c0e30eeae5';
const START = '2026-05-25';
const END = '2026-06-30';
const TIME = '10:00';
const TZ = 'America/Chicago';

function eachWeekday(start: string, end: string): string[] {
  const a = new Date(`${start}T00:00:00Z`);
  const b = new Date(`${end}T00:00:00Z`);
  const MS = 24 * 60 * 60 * 1000;
  const out: string[] = [];
  for (let t = a.getTime(); t <= b.getTime(); t += MS) {
    const d = new Date(t);
    const wd = d.getUTCDay();
    if (wd === 0 || wd === 6) continue;
    out.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`,
    );
  }
  return out;
}

function pickEven<T>(pool: T[], count: number): T[] {
  if (count <= 0) return [];
  if (count >= pool.length) return pool.slice();
  const out: T[] = [];
  for (let i = 0; i < count; i++) {
    const idx = count === 1 ? 0 : Math.round((i * (pool.length - 1)) / (count - 1));
    out.push(pool[idx]);
  }
  return out;
}

function wallClockUtc(yyyyMmDd: string, hhmm: string, timeZone: string): string {
  const [hh, mm] = hhmm.split(':').map((n) => parseInt(n, 10));
  const naiveUtc = new Date(
    `${yyyyMmDd}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`,
  );
  const tzHour = parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: false }).format(naiveUtc),
    10,
  );
  return new Date(naiveUtc.getTime() + (hh - tzHour) * 60 * 60 * 1000).toISOString();
}

async function main() {
  const { data: posts, error } = await admin
    .from('scheduled_posts')
    .select('id, title, scheduled_at')
    .eq('client_id', CLIENT_ID)
    .eq('editing_project_id', PROJECT_ID)
    .order('scheduled_at', { ascending: true });
  if (error) throw error;
  if (!posts || posts.length === 0) {
    console.log('no posts found');
    return;
  }

  const weekdays = eachWeekday(START, END);
  console.log(`weekdays in ${START}..${END}: ${weekdays.length}`);
  if (weekdays.length < posts.length) {
    throw new Error(`only ${weekdays.length} weekdays for ${posts.length} posts`);
  }
  const picks = pickEven(weekdays, posts.length);
  console.log(`picks: ${picks.join(', ')}`);

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i] as { id: string; title: string | null };
    const scheduledAt = wallClockUtc(picks[i], TIME, TZ);
    const { error: upErr } = await admin
      .from('scheduled_posts')
      .update({ scheduled_at: scheduledAt })
      .eq('id', post.id);
    if (upErr) throw upErr;
    console.log(`  ${post.title} → ${picks[i]} ${TIME} ${TZ}`);
  }

  // Refresh the synthetic content_drops date range so the share-link
  // viewer header reads correctly.
  const { data: drop } = await admin
    .from('content_drops')
    .select('id')
    .eq('client_id', CLIENT_ID)
    .eq('source', 'calendar_share')
    .maybeSingle<{ id: string }>();
  if (drop) {
    await admin
      .from('content_drops')
      .update({ start_date: picks[0], end_date: picks[picks.length - 1] })
      .eq('id', drop.id);
    console.log(`updated drop ${drop.id} date range`);
  }
}

main().then(() => process.exit(0));
