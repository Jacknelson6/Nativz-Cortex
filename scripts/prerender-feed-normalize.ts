/**
 * Pre-warm `scheduler_media.feed_normalized_url` for every draft image post
 * attached to a given client. Runs the same `ensureFeedCompatibleUrl` helper
 * the publish path uses, so the cron's recovery sweep ships a feed-compatible
 * URL to Zernio without paying the render cost in the hot path.
 *
 * Use this when a client's source images are vertical (9:16) and would
 * otherwise get auto-routed by Zernio/Instagram to Stories. The JIT path in
 * `resolveScheduledPostMedia` handles this lazily, but pre-warming avoids
 * cron-loop timeouts when many rows hit their scheduled_at window at once.
 *
 * Run:
 *   DOTENV_CONFIG_PATH=.env.local node_modules/.bin/tsx -r dotenv/config \
 *     scripts/prerender-feed-normalize.ts --client <client_id>
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { ensureFeedCompatibleUrl } from '@/lib/calendar/normalize-image-for-feed';

function parseArgs(): { clientId: string } {
  const idx = process.argv.indexOf('--client');
  if (idx === -1 || !process.argv[idx + 1]) {
    console.error('Usage: prerender-feed-normalize.ts --client <client_id>');
    process.exit(1);
  }
  return { clientId: process.argv[idx + 1] };
}

async function main() {
  const { clientId } = parseArgs();
  const admin = createAdminClient();

  const { data: links, error } = await admin
    .from('scheduled_post_media')
    .select(
      'post_id, sort_order, scheduler_media:media_id (id, late_media_url, storage_path, width, height, feed_normalized_url), scheduled_posts!inner (id, scheduled_at, status, client_id)',
    )
    .eq('scheduled_posts.client_id', clientId)
    .eq('scheduled_posts.status', 'draft')
    .order('sort_order');

  if (error) {
    console.error('Query failed', error);
    process.exit(1);
  }

  type Row = {
    post_id: string;
    scheduler_media: {
      id: string;
      late_media_url: string | null;
      storage_path: string | null;
      width: number | null;
      height: number | null;
      feed_normalized_url: string | null;
    } | null;
    scheduled_posts: { scheduled_at: string } | null;
  };

  const rows = (links ?? []) as unknown as Row[];
  console.log(`Found ${rows.length} media rows to pre-render for client ${clientId}`);

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const m = row.scheduler_media;
    if (!m) continue;

    if (m.feed_normalized_url) {
      console.log(`  skip ${m.id} (already cached)`);
      skipped++;
      continue;
    }

    const sourceUrl = m.late_media_url ?? m.storage_path;
    if (!sourceUrl) {
      console.warn(`  skip ${m.id} (no source URL)`);
      skipped++;
      continue;
    }

    try {
      const url = await ensureFeedCompatibleUrl(admin, {
        id: m.id,
        late_media_url: sourceUrl,
        storage_path: m.storage_path,
        feed_normalized_url: m.feed_normalized_url,
        width: m.width,
        height: m.height,
      });
      const wasNormalized = url !== sourceUrl;
      console.log(
        `  ${wasNormalized ? 'rendered' : 'in-range'} post=${row.post_id.slice(0, 8)} media=${m.id.slice(0, 8)} → ${url.slice(0, 90)}…`,
      );
      ok++;
    } catch (err) {
      console.error(`  FAIL post=${row.post_id.slice(0, 8)} media=${m.id.slice(0, 8)}`, err);
      failed++;
    }
  }

  console.log(`\nDone — rendered/in-range=${ok}, skipped=${skipped}, failed=${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
