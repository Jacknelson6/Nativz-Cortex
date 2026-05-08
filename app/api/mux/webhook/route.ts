import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getMux } from '@/lib/mux/client';
import { autoDeliverEditingProject } from '@/lib/editing/auto-deliver';
import type { SupabaseClient } from '@supabase/supabase-js';

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
 *     rendition is packaged. For SMM rows we stamp revised_mp4_url so the
 *     publish cron has a downloadable file (Zernio / Late ingest can't read
 *     HLS manifests). Editing-project rows derive playback URLs from
 *     mux_playback_id at render time and don't need this column.
 *   - video.asset.errored / video.upload.errored — flips mux_status='errored'.
 *
 * The same upload id can land on any of three tables — `content_drop_videos`,
 * `editing_project_videos`, `editing_project_raw_videos` — so each handler
 * tries all three and stops on the first match. The shape is:
 *
 *   1. tryUpdateMuxRow(admin, table, by, value, patch) attempts the UPDATE
 *      and returns true if it touched any rows. Stops iterating once one
 *      table claims the asset.
 *   2. The SMM-only `revised_video_url`/`revised_mp4_url` columns are added
 *      to the patch only when we land on `content_drop_videos`.
 *
 * Verification uses `MUX_WEBHOOK_SECRET` (set in .env.local once the webhook
 * is created in the Mux dashboard). Without the secret we still process
 * events in dev so the happy path can be exercised locally — production
 * deploys MUST set it.
 */

const VIDEO_TABLES = [
  'content_drop_videos',
  'editing_project_videos',
  'editing_project_raw_videos',
  'scheduler_media',
] as const;

type VideoTable = (typeof VIDEO_TABLES)[number];

async function tryUpdateMuxRow(
  admin: SupabaseClient,
  table: VideoTable,
  byColumn: 'mux_asset_id' | 'mux_upload_id',
  value: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  // Per-table column shape:
  //   - content_drop_videos owns `revised_video_url` (HLS) +
  //     `revised_mp4_url` (capped-1080p mp4). Both are publishing-payload
  //     surfaces.
  //   - editing_project* tables don't have those columns; we must strip
  //     them or the UPDATE 42703s.
  //   - scheduler_media reuses the same `late_media_url` slot the Zernio
  //     publish path already reads, so a static_renditions.ready event
  //     swaps the URL in place instead of adding a parallel column.
  const cleaned: Record<string, unknown> = { ...patch };
  const renditionMp4Url = cleaned.revised_mp4_url as string | undefined;
  if (table === 'scheduler_media') {
    delete cleaned.revised_video_url;
    delete cleaned.revised_mp4_url;
    if (renditionMp4Url) cleaned.late_media_url = renditionMp4Url;
  } else if (table !== 'content_drop_videos') {
    delete cleaned.revised_video_url;
    delete cleaned.revised_mp4_url;
  }
  const res = await admin
    .from(table)
    .update(cleaned)
    .eq(byColumn, value)
    .select('id');
  return (res.data ?? []).length > 0;
}

/**
 * Walk every Mux-aware table looking for a row that matches the asset/upload
 * id pair. Tries `mux_asset_id` first across each table, then falls back to
 * `mux_upload_id`. Returns the table that claimed the row, or null.
 */
async function dispatchUpdate(
  admin: SupabaseClient,
  patch: Record<string, unknown>,
  refs: { assetId: string | null; uploadId: string | null },
): Promise<VideoTable | null> {
  if (refs.assetId) {
    for (const table of VIDEO_TABLES) {
      const matched = await tryUpdateMuxRow(admin, table, 'mux_asset_id', refs.assetId, patch);
      if (matched) return table;
    }
  }
  if (refs.uploadId) {
    for (const table of VIDEO_TABLES) {
      const matched = await tryUpdateMuxRow(admin, table, 'mux_upload_id', refs.uploadId, patch);
      if (matched) return table;
    }
  }
  return null;
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const mux = getMux();
  // Cortex is multi-brand (cortex.nativz.io + cortex.andersoncollaborative.com),
  // each with its own Mux webhook + signing secret. Accept any secret that
  // verifies. MUX_WEBHOOK_SECRETS is the canonical comma-separated form;
  // MUX_WEBHOOK_SECRET stays as a single-value fallback for back-compat.
  const secrets = (process.env.MUX_WEBHOOK_SECRETS ?? process.env.MUX_WEBHOOK_SECRET ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (secrets.length > 0) {
    let verified = false;
    let lastErr: unknown = null;
    for (const secret of secrets) {
      try {
        await mux.webhooks.verifySignature(rawBody, req.headers, secret);
        verified = true;
        break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (!verified) {
      console.error('[mux-webhook] signature verification failed across all secrets', lastErr);
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === 'production') {
    console.error('[mux-webhook] MUX_WEBHOOK_SECRETS / MUX_WEBHOOK_SECRET not set in production');
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
    const uploadId = typeof data.id === 'string' ? data.id : null;
    const assetId = typeof data.asset_id === 'string' ? data.asset_id : null;
    if (!uploadId || !assetId) {
      console.warn('[mux-webhook] upload.asset_created missing ids', { uploadId, assetId });
      return NextResponse.json({ ok: true });
    }
    const matched = await dispatchUpdate(
      admin,
      { mux_asset_id: assetId, mux_status: 'processing' },
      { assetId: null, uploadId },
    );
    if (!matched) {
      console.warn('[mux-webhook] upload.asset_created matched no row', { uploadId, assetId });
    }
    return NextResponse.json({ ok: true });
  }

  if (eventType === 'video.asset.ready') {
    const assetId = typeof data.id === 'string' ? data.id : null;
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

    const patch: Record<string, unknown> = {
      mux_status: 'ready',
      // Stamp asset_id on this path too — covers the race where
      // upload.asset_created fires after asset.ready (or never fires).
      mux_asset_id: assetId,
    };
    if (playbackId) {
      patch.mux_playback_id = playbackId;
      // SMM-only column; tryUpdateMuxRow strips it when not targeting
      // content_drop_videos.
      patch.revised_video_url = `https://stream.mux.com/${playbackId}.m3u8`;
    }

    const matched = await dispatchUpdate(admin, patch, { assetId, uploadId });
    if (!matched) {
      console.warn('[mux-webhook] asset.ready matched no row', { assetId, uploadId });
    }

    // Auto-deliver gate. Only fires for editing-project rows, when every
    // video on the project is ready, and only if the project has no
    // active (non-archived) share link yet. Manual minting from the
    // detail dialog beats us to it most of the time; this is the
    // "uploads finished while admin was away" path.
    if (matched === 'editing_project_videos' && assetId) {
      try {
        const { data: row } = await admin
          .from('editing_project_videos')
          .select('project_id')
          .eq('mux_asset_id', assetId)
          .maybeSingle<{ project_id: string }>();
        const projectId = row?.project_id ?? null;
        if (projectId) {
          // All videos on the project must be ready before we deliver.
          const { data: siblings } = await admin
            .from('editing_project_videos')
            .select('id, mux_status')
            .eq('project_id', projectId);
          const allReady =
            (siblings ?? []).length > 0 &&
            (siblings ?? []).every(
              (v) => (v as { mux_status: string | null }).mux_status === 'ready',
            );
          if (allReady) {
            // Skip if a share link already exists (manual mint or prior
            // auto-deliver). archived links don't block — a fresh
            // delivery cycle is fine after a hard archive.
            const { data: existingLink } = await admin
              .from('editing_project_share_links')
              .select('id')
              .eq('project_id', projectId)
              .is('archived_at', null)
              .limit(1)
              .maybeSingle<{ id: string }>();
            if (!existingLink) {
              // Auto-deliver disabled 2026-05-06 (Jack). The Mux
              // webhook no longer mints a share link + emails the
              // brand the moment all renditions finish — admins now
              // press Send manually from the modal once they've
              // double-checked the cuts. The function is still wired
              // up below so we can re-enable later.
              void autoDeliverEditingProject;
            }
          }
        }
      } catch (err) {
        console.error('[mux-webhook] auto-deliver gate failed', {
          assetId,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({ ok: true });
  }

  if (eventType === 'video.asset.static_renditions.ready') {
    const assetId = typeof data.id === 'string' ? data.id : null;
    const uploadId = typeof data.upload_id === 'string' ? data.upload_id : null;
    if (!assetId) {
      console.warn('[mux-webhook] static_renditions.ready missing asset id');
      return NextResponse.json({ ok: true });
    }

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

    // SMM-only patch — only `content_drop_videos` consumes revised_mp4_url.
    // The dispatcher strips it for editing tables, so the row write becomes a
    // no-op there (but we still scan + log a match for visibility).
    const patch = {
      revised_mp4_url: `https://stream.mux.com/${playbackId}/capped-1080p.mp4`,
    };
    const matched = await dispatchUpdate(admin, patch, { assetId, uploadId });
    if (!matched) {
      console.warn('[mux-webhook] static_renditions.ready matched no row', { assetId, uploadId });
    }
    return NextResponse.json({ ok: true });
  }

  if (eventType === 'video.asset.errored' || eventType === 'video.upload.errored') {
    const id = typeof data.id === 'string' ? data.id : null;
    if (!id) {
      return NextResponse.json({ ok: true });
    }
    const refs =
      eventType === 'video.asset.errored'
        ? { assetId: id, uploadId: null }
        : { assetId: null, uploadId: id };
    const matched = await dispatchUpdate(admin, { mux_status: 'errored' }, refs);
    if (!matched) {
      console.warn(`[mux-webhook] ${eventType} matched no row`, { id });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
