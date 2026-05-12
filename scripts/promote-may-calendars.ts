// One-shot: promote CHHJ + Rana Furniture "May Calendar" editing projects
// to scheduled_posts drafts. Mirrors the logic of
// app/api/admin/editing/projects/[id]/promote-to-calendar/route.ts so it
// can run from the CLI without an authenticated session.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { generateCaptionsForScheduledPosts } from '../lib/editing/generate-captions-for-posts';

import { existsSync } from 'fs';
const envPath = existsSync('.env.local')
  ? '.env.local'
  : '../../../.env.local';
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const TARGETS: { projectId: string; label: string }[] = [
  { projectId: '94e53bde-0074-441f-8ada-88314f306f8a', label: 'CHHJ May Calendar' },
  { projectId: '3a3f6c92-dce3-471e-b23b-84d8d53935ee', label: 'Rana Furniture May Calendar' },
];

const START_DATE = '2026-05-11';
const END_DATE = '2026-05-29';
const FALLBACK_TIME = '10:00';
const FALLBACK_TZ = 'America/Chicago';

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
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      hour12: false,
    }).format(naiveUtc),
    10,
  );
  return new Date(naiveUtc.getTime() + (hh - tzHour) * 60 * 60 * 1000).toISOString();
}

async function promote(projectId: string, label: string) {
  console.log(`\n=== ${label} (${projectId}) ===`);

  const { data: project, error: projectError } = await admin
    .from('editing_projects')
    .select(
      `id, client_id, name, promoted_at,
       client:clients!editing_projects_client_id_fkey(id, default_posting_time, default_posting_timezone)`,
    )
    .eq('id', projectId)
    .maybeSingle();
  if (projectError) throw projectError;
  if (!project) throw new Error('project not found');
  if (project.promoted_at) {
    console.log(`already promoted at ${project.promoted_at}, skipping`);
    return;
  }

  const clientRow = (project as { client?: { default_posting_time?: string | null; default_posting_timezone?: string | null } | { default_posting_time?: string | null; default_posting_timezone?: string | null }[] | null }).client;
  const clientCfg = Array.isArray(clientRow) ? clientRow[0] : clientRow;

  const { data: videos, error: videosError } = await admin
    .from('editing_project_videos')
    .select(
      'id, filename, title, position, version, mux_asset_id, mux_playback_id, mux_status, thumbnail_url, duration_s, size_bytes, mime_type',
    )
    .eq('project_id', projectId)
    .order('position', { ascending: true })
    .order('version', { ascending: false });
  if (videosError) throw videosError;

  const latestPerPosition: Array<{
    id: string;
    filename: string | null;
    title: string | null;
    position: number;
    version: number;
    mux_asset_id: string | null;
    mux_playback_id: string | null;
    mux_status: string | null;
    thumbnail_url: string | null;
    duration_s: number | null;
    size_bytes: number | null;
    mime_type: string | null;
  }> = [];
  const seen = new Set<number>();
  for (const v of (videos ?? []) as typeof latestPerPosition) {
    if (seen.has(v.position)) continue;
    seen.add(v.position);
    latestPerPosition.push(v);
  }
  console.log(`videos: ${latestPerPosition.length}`);

  if (latestPerPosition.length === 0) {
    console.log('no videos, skipping');
    return;
  }

  const weekdays = eachWeekday(START_DATE, END_DATE);
  if (weekdays.length < latestPerPosition.length) {
    throw new Error(
      `Window ${START_DATE}..${END_DATE} has ${weekdays.length} weekdays but project has ${latestPerPosition.length} videos`,
    );
  }
  const perVideoDates = pickEven(weekdays, latestPerPosition.length);
  const timeZone = clientCfg?.default_posting_timezone ?? FALLBACK_TZ;
  const timeOfDay = (clientCfg?.default_posting_time ?? FALLBACK_TIME).slice(0, 5);
  console.log(`scheduling at ${timeOfDay} ${timeZone}, dates: ${perVideoDates.join(', ')}`);

  // Find Jack's user id to attribute the inserts.
  const { data: jack } = await admin
    .from('users')
    .select('id, email')
    .ilike('email', 'jack@nativz.io')
    .maybeSingle();
  if (!jack) throw new Error('jack@nativz.io user row missing');

  const mediaRows = latestPerPosition.map((v) => {
    const mp4Url =
      v.mux_status === 'ready' && v.mux_playback_id
        ? `https://stream.mux.com/${v.mux_playback_id}/capped-1080p.mp4`
        : null;
    return {
      client_id: project.client_id,
      uploaded_by: jack.id,
      filename: v.filename ?? v.title ?? 'untitled.mp4',
      storage_path: v.mux_playback_id ? `mux:${v.mux_playback_id}` : `editing:${v.id}`,
      thumbnail_url: v.thumbnail_url,
      duration_seconds: v.duration_s,
      file_size_bytes: v.size_bytes,
      mime_type: v.mime_type ?? 'video/mp4',
      mux_asset_id: v.mux_asset_id,
      mux_playback_id: v.mux_playback_id,
      mux_status: v.mux_status,
      late_media_url: mp4Url,
      is_used: true,
    };
  });

  const { data: insertedMedia, error: mediaError } = await admin
    .from('scheduler_media')
    .insert(mediaRows)
    .select('id');
  if (mediaError || !insertedMedia) throw mediaError ?? new Error('media insert failed');

  const postRows = latestPerPosition.map((v, idx) => ({
    client_id: project.client_id,
    created_by: jack.id,
    editing_project_id: project.id,
    status: 'draft' as const,
    caption: '',
    title: v.title ?? v.filename ?? null,
    post_type: 'reel' as const,
    scheduled_at: wallClockUtc(perVideoDates[idx], timeOfDay, timeZone),
  }));

  const { data: insertedPosts, error: postsError } = await admin
    .from('scheduled_posts')
    .insert(postRows)
    .select('id');
  if (postsError || !insertedPosts) {
    await admin
      .from('scheduler_media')
      .delete()
      .in('id', insertedMedia.map((m) => m.id));
    throw postsError ?? new Error('posts insert failed');
  }

  const linkRows = insertedPosts.map((post, idx) => ({
    post_id: post.id,
    media_id: insertedMedia[idx].id,
    sort_order: 0,
  }));
  const { error: linkError } = await admin.from('scheduled_post_media').insert(linkRows);
  if (linkError) {
    await admin.from('scheduled_posts').delete().in('id', insertedPosts.map((p) => p.id));
    await admin.from('scheduler_media').delete().in('id', insertedMedia.map((m) => m.id));
    throw linkError;
  }

  await admin
    .from('editing_projects')
    .update({ promoted_at: new Date().toISOString() })
    .eq('id', project.id);

  console.log(`inserted ${insertedPosts.length} posts. generating captions...`);

  const result = await generateCaptionsForScheduledPosts(admin, {
    postIds: insertedPosts.map((p) => p.id),
    clientId: project.client_id,
    userId: jack.id,
    userEmail: jack.email ?? undefined,
  });
  console.log(`captions: generated=${result.generated} failed=${result.failed}`);
}

async function main() {
  for (const t of TARGETS) {
    try {
      await promote(t.projectId, t.label);
    } catch (err) {
      console.error(`ERR ${t.label}:`, err);
    }
  }
}

main().then(() => process.exit(0));
