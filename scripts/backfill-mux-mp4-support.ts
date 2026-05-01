/**
 * One-shot: enable capped-1080p MP4 rendition on every Mux asset that
 * already has a revision uploaded, then poll until the rendition lands and
 * stamp `content_drop_videos.revised_mp4_url`.
 *
 * Why this exists: the share-link revision uploader was minting Mux uploads
 * WITHOUT mp4_support, so revised cuts only had HLS playback. The publish
 * cron (now updated) needs an MP4 URL to hand to Zernio/Late ingest. New
 * revisions get mp4_support set at upload time. This script catches up the
 * existing rows.
 *
 * Run: set -a && source .env.local && set +a && npx tsx scripts/backfill-mux-mp4-support.ts
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import Mux from '@mux/mux-node';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MUX_TOKEN_ID = process.env.MUX_TOKEN_ID;
const MUX_TOKEN_SECRET = process.env.MUX_TOKEN_SECRET;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!MUX_TOKEN_ID || !MUX_TOKEN_SECRET) {
  console.error('Missing MUX_TOKEN_ID / MUX_TOKEN_SECRET');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});
const mux = new Mux({ tokenId: MUX_TOKEN_ID, tokenSecret: MUX_TOKEN_SECRET });

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

type Row = {
  id: string;
  mux_asset_id: string;
  mux_playback_id: string | null;
  revised_mp4_url: string | null;
};

async function processRow(row: Row): Promise<void> {
  const label = `[${row.id.slice(0, 8)}]`;
  if (row.revised_mp4_url) {
    console.log(`${label} already has revised_mp4_url, skipping`);
    return;
  }

  // 1. Enable capped-1080p mp4 if not already. Idempotent: re-issuing the
  //    same mp4_support value is a no-op on Mux's side.
  let asset = await mux.video.assets.retrieve(row.mux_asset_id);
  const currentMp4 = (asset as unknown as { mp4_support?: string }).mp4_support;
  if (currentMp4 !== 'capped-1080p') {
    console.log(`${label} enabling capped-1080p (was ${currentMp4 ?? 'none'})`);
    await mux.video.assets.updateMP4Support(row.mux_asset_id, {
      mp4_support: 'capped-1080p',
    });
  } else {
    console.log(`${label} mp4_support already capped-1080p`);
  }

  // 2. Poll for static_renditions.status === 'ready'.
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    asset = await mux.video.assets.retrieve(row.mux_asset_id);
    const status = asset.static_renditions?.status;
    if (status === 'ready') break;
    if (status === 'errored' || status === 'disabled') {
      throw new Error(`Mux static_renditions ${status} for ${row.mux_asset_id}`);
    }
    process.stdout.write(`${label} static_renditions=${status ?? 'pending'}, sleeping…\r`);
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  if (asset.static_renditions?.status !== 'ready') {
    throw new Error(
      `Timed out waiting for static_renditions on ${row.mux_asset_id} after ${POLL_TIMEOUT_MS}ms`,
    );
  }

  // 3. Resolve playback id (prefer the row's, fall back to the asset's
  //    public playback id if the row didn't have one stamped).
  const publicId = asset.playback_ids?.find((p) => p.policy === 'public');
  const playbackId = row.mux_playback_id ?? publicId?.id ?? null;
  if (!playbackId) {
    throw new Error(`No public playback id on ${row.mux_asset_id}`);
  }

  const url = `https://stream.mux.com/${playbackId}/capped-1080p.mp4`;
  const { error } = await supabase
    .from('content_drop_videos')
    .update({ revised_mp4_url: url })
    .eq('id', row.id);
  if (error) {
    throw new Error(`Update failed for ${row.id}: ${error.message}`);
  }
  console.log(`\n${label} stamped revised_mp4_url=${url}`);
}

async function main() {
  const { data: rows, error } = await supabase
    .from('content_drop_videos')
    .select('id, mux_asset_id, mux_playback_id, revised_mp4_url')
    .not('mux_asset_id', 'is', null)
    .not('revised_video_uploaded_at', 'is', null)
    .is('revised_mp4_url', null)
    .returns<Row[]>();
  if (error) {
    console.error('Query failed:', error.message);
    process.exit(1);
  }
  if (!rows || rows.length === 0) {
    console.log('No rows need backfill.');
    return;
  }

  console.log(`Backfilling ${rows.length} row(s)…\n`);
  for (const row of rows) {
    try {
      await processRow(row);
    } catch (err) {
      console.error(`\n[${row.id.slice(0, 8)}] FAILED:`, err instanceof Error ? err.message : err);
    }
  }
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
