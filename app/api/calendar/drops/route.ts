import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { listMediaInFolder } from '@/lib/calendar/drive-folder';
import { getActiveBrand } from '@/lib/active-brand';
import { sanitizeFilename } from '@/lib/editing/storage';

export async function GET(req: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const clientId = url.searchParams.get('clientId');
  const handoff = url.searchParams.get('handoff');
  if (!clientId && !handoff) return NextResponse.json({ drops: [] });

  let query = supabase
    .from('content_drops')
    .select('*, clients(name)')
    .order('created_at', { ascending: false });
  if (clientId) query = query.eq('client_id', clientId);
  if (handoff && handoff !== 'all') {
    const VALID = ['editing', 'smm_review', 'smm_approved', 'smm_rejected', 'client_sent'];
    if (!VALID.includes(handoff)) {
      return NextResponse.json({ error: 'invalid handoff filter' }, { status: 400 });
    }
    query = query.eq('handoff_state', handoff);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ drops: data ?? [] });
}

const FileManifestSchema = z.object({
  filename: z.string().min(1).max(300),
  mime_type: z.string().min(1).max(120),
  size_bytes: z.number().int().nonnegative(),
});

// Two acceptable bodies on the same endpoint:
//   - Drive mode (legacy): `driveFolderUrl`. We list the folder server-side
//     and seed rows from those files.
//   - Direct-upload mode: `files` manifest of what the browser is about to
//     PUT. We mint signed-upload URLs against `scheduler-media` and let the
//     client upload the bytes. The drop sits in `ingesting` until the
//     client hits `/finalize` to kick off captioning.
// We discriminate on the presence of `files` because that's the cheapest
// signal; if both are sent we take direct-upload.
const CreateDropSchema = z.object({
  clientId: z.string().uuid(),
  driveFolderUrl: z.string().url().optional(),
  files: z.array(FileManifestSchema).min(1).max(60).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  defaultPostTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  mediaType: z.enum(['video', 'image']).optional(),
});

const SCHEDULER_BUCKET = 'scheduler-media';

function deriveExt(mimeType: string, filename: string): string {
  const m = mimeType.toLowerCase();
  if (m.includes('mp4')) return 'mp4';
  if (m.includes('quicktime') || m.includes('mov')) return 'mov';
  if (m.includes('webm')) return 'webm';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  const dot = filename.lastIndexOf('.');
  if (dot >= 0) return filename.slice(dot + 1).toLowerCase();
  return m.startsWith('image/') ? 'jpg' : 'mp4';
}

function detectMediaType(mimeType: string): 'video' | 'image' | null {
  const m = mimeType.toLowerCase();
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('image/')) return 'image';
  return null;
}

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
  const { clientId, driveFolderUrl, files, startDate, endDate, defaultPostTime } = parsed.data;
  if (new Date(startDate) > new Date(endDate)) {
    return NextResponse.json({ error: 'startDate must be on or before endDate' }, { status: 400 });
  }

  // Brand-context guard. The body's clientId can lag the brand pill during
  // the optimistic-then-router.refresh window, which previously let drops
  // file under whichever brand was active *before* the user picked the
  // current one. Reject the mismatch outright instead of silently filing
  // the drop under the wrong brand and generating off-brand captions.
  const active = await getActiveBrand();
  if (active.brand && active.brand.id !== clientId) {
    return NextResponse.json(
      {
        error:
          'brand_mismatch: active brand does not match the supplied clientId. Refresh the page and try again.',
        activeBrandId: active.brand.id,
        suppliedClientId: clientId,
      },
      { status: 409 },
    );
  }

  // ---------- Direct-upload branch ----------
  if (files && files.length > 0) {
    return createDirectUploadDrop({
      user,
      clientId,
      files,
      startDate,
      endDate,
      defaultPostTime,
    });
  }

  // ---------- Drive branch (legacy) ----------
  if (!driveFolderUrl) {
    return NextResponse.json(
      { error: 'Either `files` or `driveFolderUrl` is required' },
      { status: 400 },
    );
  }
  const mediaType = parsed.data.mediaType ?? 'video';
  return createDriveDrop({
    user,
    clientId,
    driveFolderUrl,
    startDate,
    endDate,
    defaultPostTime,
    mediaType,
    req,
  });
}

async function createDirectUploadDrop(opts: {
  user: { id: string; email?: string | null };
  clientId: string;
  files: { filename: string; mime_type: string; size_bytes: number }[];
  startDate: string;
  endDate: string;
  defaultPostTime: string | undefined;
}) {
  const { user, clientId, files, startDate, endDate, defaultPostTime } = opts;
  // All files in one drop must share a media type. The dialog enforces this
  // before posting, but we re-check here so a hand-crafted request can't
  // sneak a mixed batch into the analysis pipeline (which has separate code
  // paths for video and image).
  const detected = files.map((f) => detectMediaType(f.mime_type));
  if (detected.some((m) => m === null)) {
    return NextResponse.json(
      { error: 'Unsupported file type. Each file must be a video or an image.' },
      { status: 400 },
    );
  }
  const mediaType = detected[0] as 'video' | 'image';
  if (detected.some((m) => m !== mediaType)) {
    return NextResponse.json(
      {
        error:
          'Mixed media types are not supported in one calendar. Upload either all videos or all images.',
      },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data: drop, error: dropErr } = await admin
    .from('content_drops')
    .insert({
      client_id: clientId,
      created_by: user.id,
      drive_folder_url: null,
      drive_folder_id: null,
      start_date: startDate,
      end_date: endDate,
      default_post_time: defaultPostTime ?? '12:00',
      total_videos: files.length,
      status: 'ingesting',
      media_type: mediaType,
      source: 'direct_upload',
    })
    .select('*')
    .single();
  if (dropErr || !drop) {
    return NextResponse.json(
      { error: dropErr?.message ?? 'Failed to create content calendar' },
      { status: 500 },
    );
  }

  // Insert the post rows first so we know each row's id and can build the
  // final storage path. We do NOT populate `video_url` / asset URLs until
  // the browser confirms an upload finished (the row stays `pending` so
  // the ingest step picks it up to set the public URL).
  const postRows = files.map((f, idx) => ({
    drop_id: drop.id,
    drive_file_id: null,
    drive_file_name: f.filename,
    mime_type: f.mime_type,
    size_bytes: f.size_bytes,
    order_index: idx,
    status: 'pending',
    media_type: mediaType,
  }));
  const { data: insertedPosts, error: vidErr } = await admin
    .from('content_drop_videos')
    .insert(postRows)
    .select('id, order_index');
  if (vidErr || !insertedPosts) {
    return NextResponse.json(
      { error: vidErr?.message ?? 'Failed to seed post rows' },
      { status: 500 },
    );
  }

  // Image drops also need an asset row per post (carousel grouping happens
  // later when the UI moves assets between posts). For direct uploads we
  // seed exactly one asset per post at position 0.
  const postIdByIndex = new Map<number, string>(
    insertedPosts.map((p) => [p.order_index, p.id]),
  );
  type AssetSeed = { postId: string; assetId: string };
  const assetByIndex = new Map<number, AssetSeed>();
  if (mediaType === 'image') {
    const assetRows = files.map((f, idx) => ({
      drop_video_id: postIdByIndex.get(idx)!,
      drive_file_id: null,
      drive_file_name: f.filename,
      mime_type: f.mime_type,
      size_bytes: f.size_bytes,
      position: 0,
      status: 'pending',
    }));
    const { data: insertedAssets, error: assetErr } = await admin
      .from('content_drop_post_assets')
      .insert(assetRows)
      .select('id, drop_video_id');
    if (assetErr || !insertedAssets) {
      return NextResponse.json(
        { error: assetErr?.message ?? 'Failed to seed asset rows' },
        { status: 500 },
      );
    }
    const postIdToIdx = new Map<string, number>(
      insertedPosts.map((p) => [p.id, p.order_index]),
    );
    for (const a of insertedAssets) {
      const idx = postIdToIdx.get(a.drop_video_id);
      if (idx === undefined) continue;
      assetByIndex.set(idx, { postId: a.drop_video_id, assetId: a.id });
    }
  }

  // Now mint a signed-upload URL per file. Path convention mirrors the
  // existing ingest paths so the publish pipeline doesn't care whether the
  // file arrived from Drive or directly.
  type UploadTicket = {
    index: number;
    filename: string;
    media_type: 'video' | 'image';
    video_id: string;
    asset_id?: string;
    storage_path: string;
    public_url: string;
    upload_url: string;
    token: string;
  };

  const tickets: UploadTicket[] = [];
  for (let i = 0; i < files.length; i += 1) {
    const f = files[i];
    const videoId = postIdByIndex.get(i)!;
    const ext = deriveExt(f.mime_type, f.filename);
    let storagePath: string;
    let assetId: string | undefined;
    if (mediaType === 'image') {
      const asset = assetByIndex.get(i);
      if (!asset) {
        return NextResponse.json(
          { error: 'Internal: missing asset row for image upload' },
          { status: 500 },
        );
      }
      assetId = asset.assetId;
      storagePath = `drops/${drop.id}/${videoId}/${asset.assetId}.${ext}`;
    } else {
      storagePath = `drops/${drop.id}/${videoId}.${ext}`;
    }

    const { data: signed, error: signErr } = await admin.storage
      .from(SCHEDULER_BUCKET)
      .createSignedUploadUrl(storagePath);
    if (signErr || !signed) {
      // We rollback the drop on failure so the user can retry cleanly
      // instead of being stuck with a half-baked row.
      await admin.from('content_drops').delete().eq('id', drop.id);
      return NextResponse.json(
        { error: `Failed to mint upload URL: ${signErr?.message ?? 'unknown'}` },
        { status: 502 },
      );
    }
    const publicUrl = admin.storage.from(SCHEDULER_BUCKET).getPublicUrl(storagePath).data
      .publicUrl;

    tickets.push({
      index: i,
      filename: sanitizeFilename(f.filename),
      media_type: mediaType,
      video_id: videoId,
      asset_id: assetId,
      storage_path: storagePath,
      public_url: publicUrl,
      upload_url: signed.signedUrl,
      token: signed.token,
    });
  }

  return NextResponse.json({ drop, uploads: tickets });
}

async function createDriveDrop(opts: {
  user: { id: string; email?: string | null };
  clientId: string;
  driveFolderUrl: string;
  startDate: string;
  endDate: string;
  defaultPostTime: string | undefined;
  mediaType: 'video' | 'image';
  req: Request;
}) {
  const { user, clientId, driveFolderUrl, startDate, endDate, defaultPostTime, mediaType, req } =
    opts;

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
