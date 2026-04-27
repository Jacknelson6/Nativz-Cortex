import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { listVideosInFolder } from '@/lib/calendar/drive-folder';

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
  if (new Date(startDate) > new Date(endDate)) {
    return NextResponse.json({ error: 'startDate must be on or before endDate' }, { status: 400 });
  }

  let folderId: string;
  let videos: { id: string; name: string; mimeType: string; size: number }[];
  try {
    const result = await listVideosInFolder(user.id, driveFolderUrl);
    folderId = result.folderId;
    videos = result.videos;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Drive listing failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (videos.length === 0) {
    return NextResponse.json({ error: 'No video files found in that folder.' }, { status: 400 });
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
      total_videos: videos.length,
      status: 'ingesting',
    })
    .select('*')
    .single();
  if (dropErr || !drop) {
    return NextResponse.json({ error: dropErr?.message ?? 'Failed to create content calendar' }, { status: 500 });
  }

  const videoRows = videos.map((v, idx) => ({
    drop_id: drop.id,
    drive_file_id: v.id,
    drive_file_name: v.name,
    mime_type: v.mimeType,
    size_bytes: v.size,
    order_index: idx,
    status: 'pending',
  }));
  const { error: vidErr } = await admin.from('content_drop_videos').insert(videoRows);
  if (vidErr) {
    return NextResponse.json({ error: vidErr.message }, { status: 500 });
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
