import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getMux } from '@/lib/mux/client';

/**
 * POST /api/mux/webhook
 *
 * Receives Mux platform webhooks. The two we actually act on:
 *   - video.upload.asset_created — fires when the upload finishes; payload
 *     carries the upload id (top-level `data.id`) and the new asset id
 *     (`data.asset_id`). We use this to attach mux_asset_id to our row.
 *   - video.asset.ready — fires when the asset is fully packaged for
 *     playback; we read the public playback id and flip mux_status='ready'.
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
    if (!assetId) {
      console.warn('[mux-webhook] asset.ready missing asset id');
      return NextResponse.json({ ok: true });
    }
    const playbackIds = Array.isArray(data.playback_ids)
      ? (data.playback_ids as Array<Record<string, unknown>>)
      : [];
    const publicId = playbackIds.find((p) => p.policy === 'public');
    const playbackId = typeof publicId?.id === 'string' ? publicId.id : null;

    const update: Record<string, unknown> = { mux_status: 'ready' };
    if (playbackId) {
      update.mux_playback_id = playbackId;
      // HLS URL Mux exposes for public playback. Stamping it onto
      // revised_video_url keeps the existing share endpoint shape working
      // for any consumer that still reads it.
      update.revised_video_url = `https://stream.mux.com/${playbackId}.m3u8`;
    }
    await admin
      .from('content_drop_videos')
      .update(update)
      .eq('mux_asset_id', assetId);
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
