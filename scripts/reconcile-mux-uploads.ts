/**
 * One-shot reconciler for content_drop_videos rows stuck in
 * mux_status='processing' / 'uploading' because the Mux webhook never
 * landed. Pulls the upload + asset directly from the Mux API and
 * stamps the row with whatever Mux says is the truth.
 *
 * Shares its core logic with the share-link GET self-heal path via
 * `lib/mux/reconcile.ts` — so anything we fix here also fixes the
 * runtime path, and vice-versa.
 *
 * Run: set -a && source .env.local && set +a && npx tsx scripts/reconcile-mux-uploads.ts
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { reconcileMuxRow } from '../lib/mux/reconcile';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!process.env.MUX_TOKEN_ID || !process.env.MUX_TOKEN_SECRET) {
  console.error('Missing MUX_TOKEN_ID / MUX_TOKEN_SECRET');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  const { data: rows, error } = await supabase
    .from('content_drop_videos')
    .select('id, mux_upload_id, mux_asset_id, mux_status, revised_mp4_url, revised_video_uploaded_at')
    .in('mux_status', ['processing', 'uploading'])
    .not('mux_upload_id', 'is', null)
    .order('revised_video_uploaded_at', { ascending: false });

  if (error) {
    console.error('Query failed:', error.message);
    process.exit(1);
  }
  if (!rows || rows.length === 0) {
    console.log('No stuck rows.');
    return;
  }

  console.log(`Reconciling ${rows.length} row(s)…\n`);
  // Sequential — Mux rate limits and we want clear logs.
  for (const row of rows) {
    const label = `[${row.id.slice(0, 8)}]`;
    const patch = await reconcileMuxRow(supabase, row);
    if (!patch) {
      console.log(`${label} no change`);
      continue;
    }
    console.log(
      `${label} → ${patch.mux_status ?? '(unchanged)'}${
        patch.mux_playback_id ? ` (${patch.mux_playback_id})` : ''
      }${patch.revised_mp4_url ? ' [+mp4]' : ''}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
