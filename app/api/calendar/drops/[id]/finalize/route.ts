import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/calendar/drops/[id]/finalize
 *
 * Called by the browser after every signed-upload PUT has resolved.
 *
 * The browser sends a per-row manifest of `{ video_id, asset_id?,
 * storage_path, public_url }` so we can stamp the public URLs onto the
 * existing post (and asset, for image drops) rows without re-listing the
 * Storage bucket. We then kick off `/process` the same way the Drive
 * branch does, fire-and-forget, so the user can close the modal and
 * watch progress poll in.
 *
 * Why a separate endpoint instead of folding into `/process`:
 *   - Direct uploads are racy by nature. The drop row exists from
 *     creation, but `video_url` isn't known until the PUT lands. Until
 *     this finalize call, ingestDrop would have nothing to point at.
 *   - Lets the client batch-confirm "all uploads done" even if one
 *     individual file failed (those rows stay `pending` and surface as
 *     failures in the UI).
 */

const ItemSchema = z.object({
  video_id: z.string().uuid(),
  asset_id: z.string().uuid().optional(),
  storage_path: z.string().min(1),
  public_url: z.string().url(),
  size_bytes: z.number().int().nonnegative().optional(),
  failed: z.boolean().optional(),
  error_detail: z.string().max(500).optional(),
});

const BodySchema = z.object({
  items: z.array(ItemSchema).min(1).max(60),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: dropId } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createAdminClient();

  // Pull the drop to confirm it's a direct-upload drop. Drive drops have
  // their own ingest path and shouldn't be re-finalized; bail loudly if
  // someone wires this up wrong.
  const { data: drop } = await admin
    .from('content_drops')
    .select('id, media_type, source, status')
    .eq('id', dropId)
    .maybeSingle();
  if (!drop) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (drop.source !== 'direct_upload') {
    return NextResponse.json(
      { error: 'Drop is not a direct-upload drop; nothing to finalize' },
      { status: 400 },
    );
  }

  const isImage = drop.media_type === 'image';

  // Stamp public URLs onto each post (and asset, for image drops). For
  // failed uploads we mark the row 'failed' with the detail so the UI can
  // show a per-file error instead of silently dropping the post.
  for (const item of parsed.data.items) {
    if (item.failed) {
      await admin
        .from('content_drop_videos')
        .update({
          status: 'failed',
          error_detail: item.error_detail ?? 'Upload failed',
        })
        .eq('id', item.video_id);
      if (isImage && item.asset_id) {
        await admin
          .from('content_drop_post_assets')
          .update({
            status: 'failed',
            error_detail: item.error_detail ?? 'Upload failed',
          })
          .eq('id', item.asset_id);
      }
      continue;
    }

    if (isImage) {
      if (!item.asset_id) continue;
      await admin
        .from('content_drop_post_assets')
        .update({
          // Leaving the asset 'pending' lets ingestDropImages pick it up
          // and run its post-aggregation step (which flips the parent
          // post to `caption_pending`). The branch in that function now
          // skips the Drive download when asset_url is already set.
          status: 'pending',
          asset_url: item.public_url,
          thumbnail_url: item.public_url,
          size_bytes: item.size_bytes ?? null,
        })
        .eq('id', item.asset_id);
    } else {
      await admin
        .from('content_drop_videos')
        .update({
          // Same idea on the video side: leave 'pending' so ingestDrop
          // picks the row up. It now detects the pre-uploaded path and
          // skips Drive download / compression; only thumbnail extraction
          // still runs (server-side ffmpeg on the supabase-hosted file).
          status: 'pending',
          video_url: item.public_url,
          size_bytes: item.size_bytes ?? null,
        })
        .eq('id', item.video_id);
    }
  }

  // Kick off the captioning pipeline the same way the Drive branch does
  // (fire-and-forget). Forward the auth cookie so the worker route can
  // also call `auth.getUser()`.
  const proto = req.headers.get('x-forwarded-proto') ?? 'http';
  const host = req.headers.get('host') ?? 'localhost:3001';
  const cookie = req.headers.get('cookie') ?? '';
  fetch(`${proto}://${host}/api/calendar/drops/${dropId}/process`, {
    method: 'POST',
    headers: { cookie },
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
