import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { listMediaInFolder } from '@/lib/calendar/drive-folder';

export async function GET(req: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const clientId = url.searchParams.get('clientId');
  if (!clientId) return NextResponse.json({ drops: [] });

  const { data, error } = await supabase
    .from('content_drops')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ drops: data ?? [] });
}

const CreateDropSchema = z.object({
  clientId: z.string().uuid(),
  driveFolderUrl: z.string().url(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  defaultPostTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  mediaType: z.enum(['video', 'image']).optional(),
});

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = CreateDropSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { clientId, driveFolderUrl, startDate, endDate, defaultPostTime } = parsed.data;
  const mediaType = parsed.data.mediaType ?? 'video';
  if (new Date(startDate) > new Date(endDate)) {
    return NextResponse.json({ error: 'startDate must be on or before endDate' }, { status: 400 });
  }

  let folderId: string;
  let files: { id: string; name: string; mimeType: string; size: number }[];
  try {
    const result = await listMediaInFolder(user.id, driveFolderUrl, mediaType);
    folderId = result.folderId;
    files = result.files;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Drive listing failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (files.length === 0) {
    const noun = mediaType === 'image' ? 'image' : 'video';
    return NextResponse.json(
      { error: `No ${noun} files found in that folder.` },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: drop, error: dropErr } = await admin
    .from('content_drops')
    .insert({
      client_id: clientId,
      created_by: user.id,
      drive_folder_url: driveFolderUrl,
      drive_folder_id: folderId,
      start_date: startDate,
      end_date: endDate,
      default_post_time: defaultPostTime ?? '10:00',
      total_videos: files.length,
      status: 'ingesting',
      media_type: mediaType,
    })
    .select('*')
    .single();
  if (dropErr || !drop) {
    return NextResponse.json({ error: dropErr?.message ?? 'Failed to create content calendar' }, { status: 500 });
  }

  // For both kinds, content_drop_videos is the *post* row. Image drops start
  // 1:1 with files (one image = one post); the carousel-grouping UI merges
  // these post rows after ingestion. Video drops continue to be 1 file = 1 post.
  const postRows = files.map((f, idx) => ({
    drop_id: drop.id,
    drive_file_id: f.id,
    drive_file_name: f.name,
    mime_type: f.mimeType,
    size_bytes: f.size,
    order_index: idx,
    status: 'pending',
    media_type: mediaType,
  }));
  const { data: insertedPosts, error: vidErr } = await admin
    .from('content_drop_videos')
    .insert(postRows)
    .select('id, drive_file_id');
  if (vidErr) {
    return NextResponse.json({ error: vidErr.message }, { status: 500 });
  }

  // Image drops: seed one asset row per post (position 0). The carousel UI
  // later moves assets across posts so multiple images attach to a single
  // drop_video. Video drops do NOT seed asset rows — they keep using the
  // legacy video_url column on content_drop_videos.
  if (mediaType === 'image' && insertedPosts && insertedPosts.length > 0) {
    const fileById = new Map(files.map((f) => [f.id, f]));
    const assetRows = insertedPosts
      .map((post) => {
        const file = fileById.get(post.drive_file_id);
        if (!file) return null;
        return {
          drop_video_id: post.id,
          drive_file_id: file.id,
          drive_file_name: file.name,
          mime_type: file.mimeType,
          size_bytes: file.size,
          position: 0,
          status: 'pending',
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (assetRows.length > 0) {
      const { error: assetErr } = await admin
        .from('content_drop_post_assets')
        .insert(assetRows);
      if (assetErr) {
        return NextResponse.json({ error: assetErr.message }, { status: 500 });
      }
    }
  }

  // Fire-and-forget background processor. We deliberately don't await it
  // — the client polls /api/calendar/drops/[id] for status. We forward
  // the user's auth cookie so the processor route can also `auth.getUser()`.
  const proto = req.headers.get('x-forwarded-proto') ?? 'http';
  const host = req.headers.get('host') ?? 'localhost:3001';
  const cookie = req.headers.get('cookie') ?? '';
  fetch(`${proto}://${host}/api/calendar/drops/${drop.id}/process`, {
    method: 'POST',
    headers: { cookie },
  }).catch(() => {});

  return NextResponse.json({ drop });
}
