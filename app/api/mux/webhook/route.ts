import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getMux } from '@/lib/mux/client';

/**
 * POST /api/mux/webhook
 *
 * Receives Mux platform webhooks. Events we act on:
 *   - video.upload.asset_created — fires when the upload finishes; payload
 *     carries the upload id (top-level `data.id`) and the new asset id
 *     (`data.asset_id`). We use this to attach mux_asset_id to our row.
 *   - video.asset.ready — fires when the asset is fully packaged for HLS
 *     playback; we read the public playback id and flip mux_status='ready'.
 *   - video.asset.static_renditions.ready — fires when the capped-1080p MP4
 *     rendition is packaged. We stamp revised_mp4_url so the publish cron has
 *     a downloadable file (Zernio / Late ingest can't read HLS manifests).
 *     This event can land BEFORE or AFTER asset.ready, so the handler is
 *     idempotent and pulls the playback id from the event payload directly.
 *
 * Everything else is logged + ignored. Verification uses
 * `MUX_WEBHOOK_SECRET` (set in .env.local once the webhook is created in the
 * Mux dashboard). Without the secret we still process events in dev so the
 * happy path can be exercised locally — production deploys MUST set it.
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  const mux = getMux();
  const secret = process.env.MUX_WEBHOOK_SECRET;

  if (secret) {
    try {
      await mux.webhooks.verifySignature(rawBody, req.headers, secret);
    } catch (err) {
      console.error('[mux-webhook] signature verification failed', err);
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === 'production') {
    console.error('[mux-webhook] MUX_WEBHOOK_SECRET not set in production');
    return NextResponse.json({ error: 'webhook secret not configured' }, { status: 500 });
  }

  let event: { type?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const admin = createAdminClient();
  const eventType = event.type;
  const data = (event.data ?? {}) as Record<string, unknown>;

  if (eventType === 'video.upload.asset_created') {
    // Upload finished and turned into an asset. Match by upload id.
    const uploadId = typeof data.id === 'string' ? data.id : null;
    const assetId = typeof data.asset_id === 'string' ? data.asset_id : null;
    if (!uploadId || !assetId) {
      console.warn('[mux-webhook] upload.asset_created missing ids', { uploadId, assetId });
      return NextResponse.json({ ok: true });
    }
    await admin
      .from('content_drop_videos')
      .update({ mux_asset_id: assetId, mux_status: 'processing' })
      .eq('mux_upload_id', uploadId);
    return NextResponse.json({ ok: true });
  }

  if (eventType === 'video.asset.ready') {
    // Asset is packaged and ready to play. Pull the first public playback id
    // and stamp it. We also patch revised_video_url so legacy code that
    // reads that field still works (kept as the canonical Mux playback URL).
    const assetId = typeof data.id === 'string' ? data.id : null;
    // For direct uploads, Mux includes the originating upload_id on the
    // asset payload — we use it as a fallback lookup when the row hasn't
    // had its mux_asset_id stamped yet (Mux doesn't guarantee
    // upload.asset_created fires before asset.ready, and that race used
    // to leave us stuck on "Processing" forever because no row matched).
    const uploadId = typeof data.upload_id === 'string' ? data.upload_id : null;
    if (!assetId) {
      console.warn('[mux-webhook] asset.ready missing asset id');
      return NextResponse.json({ ok: true });
    }
    const playbackIds = Array.isArray(data.playback_ids)
      ? (data.playback_ids as Array<Record<string, unknown>>)
      : [];
    const publicId = playbackIds.find((p) => p.policy === 'public');
    const playbackId = typeof publicId?.id === 'string' ? publicId.id : null;

    const update: Record<string, unknown> = {
      mux_status: 'ready',
      // Always stamp asset_id on this path too — covers the race where
      // upload.asset_created fires after asset.ready (or never fires).
      mux_asset_id: assetId,
    };
    if (playbackId) {
      update.mux_playback_id = playbackId;
      // HLS URL Mux exposes for public playback. Stamping it onto
      // revised_video_url keeps the existing share endpoint shape working
      // for any consumer that still reads it.
      update.revised_video_url = `https://stream.mux.com/${playbackId}.m3u8`;
    }
    // Try asset_id first (the normal path once upload.asset_created has
    // landed); fall back to upload_id if no row was updated. Supabase's
    // update returns affected rows when count is requested, so we can
    // detect a no-match cleanly without a separate select.
    const byAsset = await admin
      .from('content_drop_videos')
      .update(update)
      .eq('mux_asset_id', assetId)
      .select('id');
    const matchedAsset = (byAsset.data ?? []).length > 0;
    if (!matchedAsset && uploadId) {
      const byUpload = await admin
        .from('content_drop_videos')
        .update(update)
        .eq('mux_upload_id', uploadId)
        .select('id');
      if ((byUpload.data ?? []).length === 0) {
        console.warn('[mux-webhook] asset.ready matched no row', {
          assetId,
          uploadId,
        });
      }
    } else if (!matchedAsset) {
      console.warn('[mux-webhook] asset.ready matched no row and no upload_id fallback', {
        assetId,
      });
    }
    return NextResponse.json({ ok: true });
  }

  if (eventType === 'video.asset.static_renditions.ready') {
    // MP4 rendition pack landed. Stamp revised_mp4_url with the stable
    // capped-1080p URL Mux exposes. The publish cron treats a populated
    // revised_video_uploaded_at + null revised_mp4_url as "still rendering"
    // and refuses to publish — so this stamp is what unblocks it.
    const assetId = typeof data.id === 'string' ? data.id : null;
    const uploadId = typeof data.upload_id === 'string' ? data.upload_id : null;
    if (!assetId) {
      console.warn('[mux-webhook] static_renditions.ready missing asset id');
      return NextResponse.json({ ok: true });
    }

    // Pull playback id from the payload (data is the asset object). If it's
    // not there for some reason, retrieve the asset directly so we don't
    // silently miss the URL.
    const playbackIds = Array.isArray(data.playback_ids)
      ? (data.playback_ids as Array<Record<string, unknown>>)
      : [];
    let publicId = playbackIds.find((p) => p.policy === 'public');
    let playbackId = typeof publicId?.id === 'string' ? publicId.id : null;
    if (!playbackId) {
      try {
        const asset = await mux.video.assets.retrieve(assetId);
        publicId = asset.playback_ids?.find((p) => p.policy === 'public') as
          | Record<string, unknown>
          | undefined;
        playbackId = typeof publicId?.id === 'string' ? publicId.id : null;
      } catch (err) {
        console.warn('[mux-webhook] static_renditions.ready asset retrieve failed', {
          assetId,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
    if (!playbackId) {
      console.warn('[mux-webhook] static_renditions.ready no public playback id', { assetId });
      return NextResponse.json({ ok: true });
    }

    const update = {
      revised_mp4_url: `https://stream.mux.com/${playbackId}/capped-1080p.mp4`,
    };

    const byAsset = await admin
      .from('content_drop_videos')
      .update(update)
      .eq('mux_asset_id', assetId)
      .select('id');
    const matchedAsset = (byAsset.data ?? []).length > 0;
    if (!matchedAsset && uploadId) {
      const byUpload = await admin
        .from('content_drop_videos')
        .update(update)
        .eq('mux_upload_id', uploadId)
        .select('id');
      if ((byUpload.data ?? []).length === 0) {
        console.warn('[mux-webhook] static_renditions.ready matched no row', {
          assetId,
          uploadId,
        });
      }
    } else if (!matchedAsset) {
      console.warn('[mux-webhook] static_renditions.ready matched no row, no upload_id', {
        assetId,
      });
    }
    return NextResponse.json({ ok: true });
  }

  if (eventType === 'video.asset.errored' || eventType === 'video.upload.errored') {
    const assetId = typeof data.id === 'string' ? data.id : null;
    const uploadId = typeof data.id === 'string' ? data.id : null;
    if (eventType === 'video.asset.errored' && assetId) {
      await admin
        .from('content_drop_videos')
        .update({ mux_status: 'errored' })
        .eq('mux_asset_id', assetId);
    } else if (uploadId) {
      await admin
        .from('content_drop_videos')
        .update({ mux_status: 'errored' })
        .eq('mux_upload_id', uploadId);
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
