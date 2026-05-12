// One-shot: mint /s/{token} share links for CHHJ + Rana Furniture May
// drafts. Replicates the logic of POST /api/scheduler/share so it runs
// from the CLI without an authenticated session.
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { mintOrRefreshShareLink } from '../lib/calendar/share-link';

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

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';

const TARGETS: { projectId: string; clientId: string; label: string }[] = [
  {
    projectId: '94e53bde-0074-441f-8ada-88314f306f8a',
    clientId: '85d52b89-8d70-4a6e-8188-f7f0384a31bc',
    label: 'College Hunks Hauling Junk',
  },
  {
    projectId: '3a3f6c92-dce3-471e-b23b-84d8d53935ee',
    clientId: '81584bba-5331-4a38-8a92-82c0e30eeae5',
    label: 'Rana Furniture',
  },
];

type MediaRow = {
  id: string;
  filename: string | null;
  late_media_url: string | null;
  storage_path: string | null;
  thumbnail_url: string | null;
  mime_type: string | null;
  width: number | null;
  height: number | null;
};

function resolveMediaUrl(media: MediaRow | undefined): string | null {
  if (!media) return null;
  if (media.late_media_url) return media.late_media_url;
  if (!media.storage_path) return null;
  if (/^https?:\/\//i.test(media.storage_path)) return media.storage_path;
  const { data } = admin.storage.from('scheduler-media').getPublicUrl(media.storage_path);
  return data.publicUrl;
}

async function getOrCreateDrop(clientId: string, createdBy: string): Promise<string> {
  const { data: existing } = await admin
    .from('content_drops')
    .select('id')
    .eq('client_id', clientId)
    .eq('source', 'calendar_share')
    .maybeSingle<{ id: string }>();
  if (existing) return existing.id;

  const { data: created, error } = await admin
    .from('content_drops')
    .insert({
      client_id: clientId,
      created_by: createdBy,
      source: 'calendar_share',
      status: 'ready',
    })
    .select('id')
    .single<{ id: string }>();
  if (error || !created) throw new Error(error?.message ?? 'create drop failed');
  return created.id;
}

async function mirrorPostsAsDropVideos(dropId: string, postIds: string[]) {
  const { data: posts } = await admin
    .from('scheduled_posts')
    .select('id, post_type')
    .in('id', postIds);
  const postTypeById = new Map(
    ((posts ?? []) as { id: string; post_type: string | null }[]).map((p) => [p.id, p.post_type]),
  );

  const { data: mediaLinks } = await admin
    .from('scheduled_post_media')
    .select(
      'post_id, sort_order, scheduler_media:media_id (id, filename, late_media_url, storage_path, thumbnail_url, mime_type, width, height)',
    )
    .in('post_id', postIds)
    .order('sort_order', { ascending: true });

  type LinkRow = {
    post_id: string;
    sort_order: number | null;
    scheduler_media: MediaRow | MediaRow[] | null;
  };
  const mediaByPost = new Map<string, { sort_order: number; media: MediaRow }[]>();
  for (const row of (mediaLinks ?? []) as LinkRow[]) {
    const m = Array.isArray(row.scheduler_media) ? row.scheduler_media[0] : row.scheduler_media;
    if (!m) continue;
    const arr = mediaByPost.get(row.post_id) ?? [];
    arr.push({ sort_order: row.sort_order ?? 0, media: m });
    mediaByPost.set(row.post_id, arr);
  }

  const dropVideoRows = postIds.map((postId, idx) => {
    const postType = postTypeById.get(postId);
    const items = mediaByPost.get(postId) ?? [];
    const first = items[0]?.media;
    const firstMime = first?.mime_type ?? null;
    const isImage = firstMime
      ? firstMime.startsWith('image/')
      : postType === 'image' || postType === 'carousel';
    return {
      drop_id: dropId,
      scheduled_post_id: postId,
      media_type: isImage ? 'image' : 'video',
      drive_file_id: null,
      drive_file_name: first?.filename ?? null,
      video_url: isImage ? null : resolveMediaUrl(first),
      thumbnail_url: first?.thumbnail_url ?? null,
      mime_type: first?.mime_type ?? null,
      order_index: idx,
      status: 'ready' as const,
    };
  });

  if (dropVideoRows.length === 0) return;

  const { data: insertedVideos, error: videoErr } = await admin
    .from('content_drop_videos')
    .insert(dropVideoRows)
    .select('id, scheduled_post_id, media_type');
  if (videoErr || !insertedVideos) {
    throw new Error(videoErr?.message ?? 'mirror videos failed');
  }

  const assetRows: Array<Record<string, unknown>> = [];
  for (const v of insertedVideos as Array<{
    id: string;
    scheduled_post_id: string;
    media_type: string;
  }>) {
    if (v.media_type !== 'image') continue;
    const items = mediaByPost.get(v.scheduled_post_id) ?? [];
    items.forEach((item, i) => {
      assetRows.push({
        drop_video_id: v.id,
        drive_file_id: `scheduler-media-${item.media.id}`,
        drive_file_name: item.media.filename ?? `asset-${i + 1}`,
        asset_url: resolveMediaUrl(item.media),
        thumbnail_url: item.media.thumbnail_url,
        mime_type: item.media.mime_type,
        width: item.media.width,
        height: item.media.height,
        position: i,
        status: 'ready',
      });
    });
  }

  if (assetRows.length > 0) {
    const { error: assetErr } = await admin
      .from('content_drop_post_assets')
      .insert(assetRows);
    if (assetErr) throw new Error(assetErr.message);
  }
}

async function syncDropDateRange(dropId: string, postIds: string[]) {
  const { data: rows } = await admin
    .from('scheduled_posts')
    .select('scheduled_at')
    .in('id', postIds);

  const dates = ((rows ?? []) as { scheduled_at: string | null }[])
    .map((r) => r.scheduled_at)
    .filter((s): s is string => Boolean(s))
    .map((s) => s.slice(0, 10))
    .sort();
  const today = new Date().toISOString().slice(0, 10);
  const start_date = dates[0] ?? today;
  const end_date = dates[dates.length - 1] ?? start_date;
  await admin.from('content_drops').update({ start_date, end_date }).eq('id', dropId);
}

async function main() {
  const { data: jack } = await admin
    .from('users')
    .select('id, email')
    .ilike('email', 'jack@nativz.io')
    .maybeSingle<{ id: string; email: string }>();
  if (!jack) throw new Error('jack user missing');

  for (const t of TARGETS) {
    console.log(`\n=== ${t.label} ===`);

    const { data: posts } = await admin
      .from('scheduled_posts')
      .select('id')
      .eq('client_id', t.clientId)
      .eq('editing_project_id', t.projectId)
      .order('scheduled_at', { ascending: true });
    const postIds = ((posts ?? []) as { id: string }[]).map((p) => p.id);
    if (postIds.length === 0) {
      console.log('no posts, skipping');
      continue;
    }
    console.log(`posts: ${postIds.length}`);

    const dropId = await getOrCreateDrop(t.clientId, jack.id);
    await admin.from('content_drop_videos').delete().eq('drop_id', dropId);
    await mirrorPostsAsDropVideos(dropId, postIds);
    await syncDropDateRange(dropId, postIds);

    const linkRows = postIds.map((post_id) => ({ post_id }));
    const { data: reviewLinks, error: linkErr } = await admin
      .from('post_review_links')
      .insert(linkRows)
      .select('id, post_id');
    if (linkErr || !reviewLinks) throw new Error(linkErr?.message ?? 'mint review links failed');

    const reviewMap: Record<string, string> = {};
    for (const rl of reviewLinks as { id: string; post_id: string }[]) {
      reviewMap[rl.post_id] = rl.id;
    }

    const link = await mintOrRefreshShareLink(admin, {
      dropId,
      clientId: t.clientId,
      postIds,
      reviewMap,
    });

    console.log(`URL: ${APP_URL}/s/${link.token}`);
    console.log(`  refreshed=${link.refreshed} expires=${link.expires_at}`);
  }
}

main().then(() => process.exit(0));
