/**
 * One-off reconcile for "Publishing timed out" platform legs that the
 * cron's 24h reconcile sweep missed.
 *
 * Why: the cron reconcile sweep only scans rows whose `updated_at` is
 * within the last 24h. A leg that timed out and never got touched
 * again sits as `failed` forever even though the underlying platform
 * almost certainly accepted the post (Zernio handed back an
 * `external_post_id`). This script widens the lookback so we can
 * sweep historical false-fails.
 *
 * Safe to re-run: `verifyAndReconcilePost` only flips `failed` →
 * `published` when Zernio's authoritative GET says published. Real
 * failures (auth, content rejected, etc.) are skipped because they
 * don't match the timeout regex.
 *
 * Usage:
 *   npx tsx scripts/reconcile-stale-timeouts.ts          # last 60 days
 *   npx tsx scripts/reconcile-stale-timeouts.ts --days 90
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyAndReconcilePost, looksLikeTimeout } from '@/lib/calendar/verify-post';

function parseDays(): number {
  const idx = process.argv.indexOf('--days');
  if (idx === -1) return 60;
  const n = Number(process.argv[idx + 1]);
  return Number.isFinite(n) && n > 0 ? n : 60;
}

async function main() {
  const lookbackDays = parseDays();
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

  // Pull every leg that's marked failed with a timeout-pattern reason in
  // the lookback window, then de-dup to parent post ids. Verify-post
  // does the per-leg filter again itself; we just need it to know
  // which posts to look at.
  const { data: failedRows, error } = await admin
    .from('scheduled_post_platforms')
    .select('post_id, failure_reason, scheduled_posts!inner(scheduled_at, status, late_post_id)')
    .eq('status', 'failed')
    .gte('scheduled_posts.scheduled_at', cutoff);
  if (error) {
    console.error('query failed:', error);
    process.exit(1);
  }

  type Row = {
    post_id: string;
    failure_reason: string | null;
    scheduled_posts: {
      scheduled_at: string;
      status: string;
      late_post_id: string | null;
    } | null;
  };
  const rows = (failedRows ?? []) as unknown as Row[];

  const candidatePostIds = Array.from(
    new Set(
      rows
        .filter((r) => looksLikeTimeout(r.failure_reason))
        .filter((r) => r.scheduled_posts?.late_post_id)
        .map((r) => r.post_id),
    ),
  );

  console.log(
    `[reconcile] lookback=${lookbackDays}d candidates=${candidatePostIds.length}`,
  );

  let reconciledLegs = 0;
  let postsTouched = 0;
  let zernioErrors = 0;
  let noChanges = 0;

  for (const postId of candidatePostIds) {
    try {
      const result = await verifyAndReconcilePost(admin, postId);
      if (result.reason === 'reconciled') {
        postsTouched++;
        reconciledLegs += result.reconciledPlatforms;
        console.log(
          `  reconciled ${postId}: ${result.reconciledPlatforms} leg(s) → status=${result.newPostStatus}`,
        );
      } else if (result.reason === 'zernio-error') {
        zernioErrors++;
        console.log(`  zernio-error ${postId}`);
      } else {
        noChanges++;
      }
    } catch (err) {
      console.error(
        `  FATAL ${postId}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  console.log(
    `[reconcile] done. posts_touched=${postsTouched} legs=${reconciledLegs} zernio_errors=${zernioErrors} no_changes=${noChanges}`,
  );
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
