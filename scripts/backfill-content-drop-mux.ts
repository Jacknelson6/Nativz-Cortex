/**
 * Backfill: every content_drop_videos row that has a playable URL but no
 * Mux asset gets submitted as a Mux URL-pull ingest. The Mux webhook will
 * stamp mux_playback_id when packaging finishes.
 *
 * Why this exists: pre-Mux Drive drops (and early direct uploads) only
 * stored a Supabase Storage URL. The public share page rendered them
 * through a vanilla <video controls> while Mux-backed rows used the
 * branded MuxPlayer, so the same calendar would mix two visual languages.
 * The render layer now falls back to MuxPlayer's `src` mode for legacy
 * rows so the chrome is consistent immediately, but we still want every
 * row backed by a real Mux asset so HLS / capped-1080p MP4 / analytics
 * are uniformly available.
 *
 * Run: set -a && source .env.local && set +a && npx tsx scripts/backfill-content-drop-mux.ts
 *
 * Flags:
 *   --client-id=<uuid>   only this client (default: all)
 *   --drop-id=<uuid>     only this drop (default: all)
 *   --limit=<n>          stop after N rows (default: 1000)
 *   --dry-run            log what would happen, don't call Mux
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

const args = new Map<string, string>();
let dryRun = false;
for (const arg of process.argv.slice(2)) {
  if (arg === '--dry-run') {
    dryRun = true;
    continue;
  }
  const m = arg.match(/^--([^=]+)=(.*)$/);
  if (m) args.set(m[1], m[2]);
}
const clientId = args.get('client-id') ?? null;
const dropId = args.get('drop-id') ?? null;
const limit = Number(args.get('limit') ?? '1000');

async function main() {
  let query = supabase
    .from('content_drop_videos')
    .select('id, drop_id, drive_file_name, video_url, mux_asset_id, mux_status, content_drops!inner(client_id)')
    .is('mux_asset_id', null)
    .not('video_url', 'is', null)
    .neq('media_type', 'image')
    .limit(limit);

  if (dropId) query = query.eq('drop_id', dropId);
  if (clientId) query = query.eq('content_drops.client_id', clientId);

  const { data, error } = await query;
  if (error) {
    console.error('query failed:', error.message);
    process.exit(1);
  }
  const rows = (data ?? []) as Array<{
    id: string;
    drop_id: string;
    drive_file_name: string | null;
    video_url: string | null;
    mux_asset_id: string | null;
    mux_status: string | null;
  }>;

  console.log(`Found ${rows.length} rows to backfill${dryRun ? ' (DRY RUN)' : ''}`);
  if (rows.length === 0) return;

  let kicked = 0;
  let failed = 0;
  for (const row of rows) {
    const label = `${row.id} (${row.drive_file_name ?? 'unnamed'})`;
    if (!row.video_url) {
      console.log(`  skip ${label}: no video_url`);
      continue;
    }
    if (dryRun) {
      console.log(`  would kick: ${label} -> ${row.video_url.slice(0, 80)}`);
      continue;
    }
    try {
      const asset = await mux.video.assets.create({
        inputs: [{ url: row.video_url }],
        playback_policies: ['public'],
        mp4_support: 'capped-1080p',
        video_quality: 'basic',
      });
      const playback = asset.playback_ids?.find((p) => p.policy === 'public');
      const { error: updateErr } = await supabase
        .from('content_drop_videos')
        .update({
          mux_asset_id: asset.id,
          mux_playback_id: playback?.id ?? null,
          mux_status: 'processing',
        })
        .eq('id', row.id);
      if (updateErr) {
        console.error(`  update failed for ${label}: ${updateErr.message}`);
        failed += 1;
        continue;
      }
      console.log(`  kicked ${label} -> asset ${asset.id}`);
      kicked += 1;
    } catch (err) {
      console.error(`  mux create failed for ${label}: ${err instanceof Error ? err.message : String(err)}`);
      failed += 1;
    }
  }
  console.log(`Done. kicked=${kicked} failed=${failed}`);
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
