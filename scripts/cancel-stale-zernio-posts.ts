/**
 * One-shot: cancel + reset 12 SMM posts whose Zernio queue copy is
 * pinned to a stale MP4 from before the May 3 (Avondale) / Apr 29
 * (SafeStop) revision uploads. Cron's per-leg dupe guard (just landed
 * in `app/api/cron/publish-posts/route.ts`) covers all future re-runs;
 * these 12 specifically need their Zernio queue entry deleted because
 * the queued copy is the wrong content. Once cleared, the patched cron
 * will re-publish from scratch on each post's scheduled date and pick
 * up the correct revised MP4 via `resolveScheduledPostMedia`.
 *
 * Per-post sequence:
 *   1. posting.deletePost(late_post_id)   ← Zernio side first
 *   2. SQL reset:
 *        - scheduled_posts.late_post_id = NULL
 *        - scheduled_posts.status = 'scheduled'
 *        - scheduled_posts.failure_reason = NULL
 *        - scheduled_post_platforms.status = 'pending'
 *        - scheduled_post_platforms.external_post_id = NULL
 *        - scheduled_post_platforms.external_post_url = NULL
 *        - scheduled_post_platforms.failure_reason = NULL
 *        (scheduled_at + retry_count untouched)
 *
 * Order matters: Zernio first so a transient cron tick between calls
 * sees a stale-but-still-present queue entry rather than a cleared row
 * that re-publishes immediately. All 12 posts are scheduled May 8+
 * (today is May 4) so the cron's `scheduled_at <= now` filter won't
 * pick them up while we're running anyway, but the order is the safe
 * default.
 *
 * Run:
 *   set -a && source .env.local && set +a && npx tsx scripts/cancel-stale-zernio-posts.ts
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { getPostingService } from '../lib/posting';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const TARGET_POST_IDS = [
  '8f322bdb-1e78-42bf-8fff-4db5dc140fa3', // 5/8  Weston Funding
  'b6565388-7d4b-441f-9f2c-76550b05b8d2', // 5/8  Avondale Private Lending
  'f6114019-2fa7-448e-a29e-faf83be5b599', // 5/11 SafeStop
  'b2a5d922-2c4e-4872-8fe1-850041c99f5b', // 5/14 SafeStop
  '2115f6d8-6bd1-4d81-93ae-3bc463facde2', // 5/18 SafeStop
  'c164b530-68eb-4e03-a106-1f12ea0952c6', // 5/21 SafeStop
  '6f21cf54-5986-4aa2-a789-e8e2dfaa336e', // 5/21 Avondale Private Lending
  '418a2b59-b3d2-423d-89ba-694c9b2a8ee2', // 5/24 SafeStop
  '57395c49-3804-454b-b33b-4df275e432e8', // 5/28 Avondale Private Lending
  '75f9403e-cf7a-4c2b-845c-d80797930805', // 5/28 SafeStop
  '6a0949a5-a8d2-4728-bf4d-9edbee1e6a05', // 5/31 SafeStop
  'a2fd4dfd-ea46-44d9-9c76-37bcea03c8cf', // 5/31 Avondale Private Lending
];

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  const posting = getPostingService();

  const { data: rows, error } = await supabase
    .from('scheduled_posts')
    .select('id, late_post_id, scheduled_at, status, client_id')
    .in('id', TARGET_POST_IDS);
  if (error) {
    console.error('Fetch failed:', error);
    process.exit(1);
  }
  const posts = rows ?? [];
  if (posts.length !== TARGET_POST_IDS.length) {
    console.error(
      `Expected ${TARGET_POST_IDS.length} rows, got ${posts.length}. Aborting.`,
    );
    process.exit(1);
  }

  let cancelled = 0;
  let cancelMissing = 0;
  let cancelErrored = 0;
  let resetOk = 0;
  let resetErrored = 0;

  for (const post of posts) {
    const lateId = (post as { late_post_id: string | null }).late_post_id;
    const id = (post as { id: string }).id;
    const scheduledAt = (post as { scheduled_at: string }).scheduled_at;
    const tag = `${id.slice(0, 8)} (${scheduledAt.slice(0, 10)})`;

    // 1. Zernio cancel
    if (!lateId) {
      console.log(`[skip-cancel] ${tag} has no late_post_id — only DB reset needed`);
      cancelMissing++;
    } else {
      try {
        await posting.deletePost(lateId);
        console.log(`[cancel] ${tag} → deleted Zernio post ${lateId}`);
        cancelled++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Zernio 404 means the queue entry is already gone — safe to
        // proceed with the reset. Other errors abort this row so we
        // don't leave the DB cleared with a live Zernio queue copy.
        if (/\b404\b|not\s*found/i.test(msg)) {
          console.log(`[cancel-404] ${tag} late_post_id=${lateId} already gone`);
          cancelled++;
        } else {
          console.error(`[cancel-error] ${tag} late_post_id=${lateId}: ${msg}`);
          cancelErrored++;
          continue;
        }
      }
    }

    // 2. DB reset
    const nowIso = new Date().toISOString();
    const { error: postErr } = await supabase
      .from('scheduled_posts')
      .update({
        late_post_id: null,
        status: 'scheduled',
        failure_reason: null,
        external_post_id: null,
        published_at: null,
        updated_at: nowIso,
      })
      .eq('id', id);
    if (postErr) {
      console.error(`[reset-post-error] ${tag}: ${postErr.message}`);
      resetErrored++;
      continue;
    }

    const { error: sppErr } = await supabase
      .from('scheduled_post_platforms')
      .update({
        status: 'pending',
        external_post_id: null,
        external_post_url: null,
        failure_reason: null,
      })
      .eq('post_id', id);
    if (sppErr) {
      console.error(`[reset-spp-error] ${tag}: ${sppErr.message}`);
      resetErrored++;
      continue;
    }

    console.log(`[reset] ${tag} → DB cleared, status=scheduled, all legs pending`);
    resetOk++;
  }

  console.log('\n--- Summary ---');
  console.log(`Cancelled in Zernio:     ${cancelled}`);
  console.log(`Already gone in Zernio:  ${cancelMissing}`);
  console.log(`Cancel errors:           ${cancelErrored}`);
  console.log(`DB reset OK:             ${resetOk}`);
  console.log(`DB reset errors:         ${resetErrored}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
