/**
 * Smoke test for ZernioPostingService.reschedulePost.
 *
 * Verified against the Zernio OpenAPI spec (https://docs.zernio.com/api/openapi):
 *   PUT /v1/posts/{postId}  body: { scheduledFor }
 * Only `draft`, `scheduled`, `failed`, `partial` posts can be edited — Zernio
 * rejects updates to published/publishing/cancelled posts.
 *
 * What this exercises:
 *   1. Lists scheduled posts via Zernio (status='scheduled') and grabs the
 *      first one with a `scheduledFor` we can safely bump.
 *   2. Records the original time.
 *   3. Calls service.reschedulePost(id, originalTime + 1h).
 *   4. Calls service.getPostStatus(id) — but `scheduledFor` isn't returned by
 *      our mapper, so we re-fetch the raw post via listPosts and assert the
 *      time actually moved.
 *   5. Resets the post to its original time.
 *
 *   No posts are created or deleted; no notifications fire; no media is
 *   touched. Any real scheduled post is fine — we shift forward 1h, then
 *   right back to where it was. If the post is < 1h away, we skip and
 *   look for one further out.
 *
 * Run:
 *   npx tsx scripts/test-zernio-reschedule.ts
 */

import fs from 'node:fs';
import path from 'node:path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

async function main() {
  const { getPostingService } = await import('@/lib/posting');
  const service = getPostingService();

  console.log('[setup] fetching scheduled posts from Zernio…');
  const posts = await service.listPosts({ status: 'scheduled', limit: 50 });
  console.log(`[setup] found ${posts.length} scheduled post(s)`);

  // Need a post that's at least 2h in the future so we have headroom
  // to shift +1h without bumping past Zernio's "scheduledFor must be
  // in the future" guard or accidentally publishing.
  const now = Date.now();
  const minBufferMs = 2 * 60 * 60 * 1000; // 2h
  const candidate = posts.find(
    (p) =>
      p.scheduledFor &&
      new Date(p.scheduledFor).getTime() - now > minBufferMs,
  );

  if (!candidate || !candidate.scheduledFor) {
    console.log(
      '[skip] no scheduled posts at least 2h in the future. ' +
        'Schedule a future post on Zernio and re-run.',
    );
    return;
  }

  const originalIso = candidate.scheduledFor;
  const originalMs = new Date(originalIso).getTime();
  const bumpedIso = new Date(originalMs + 60 * 60 * 1000).toISOString(); // +1h

  console.log(`[target] post=${candidate.id}`);
  console.log(`[target] content="${candidate.content.slice(0, 60)}…"`);
  console.log(`[target] original scheduledFor=${originalIso}`);
  console.log(`[target] bumping to            =${bumpedIso}`);

  console.log('\n[step 1] reschedulePost → +1h');
  await service.reschedulePost(candidate.id, bumpedIso);
  console.log('[step 1] OK (no throw)');

  console.log('\n[step 2] re-list to confirm new scheduledFor');
  const after = await service.listPosts({ status: 'scheduled', limit: 50 });
  const updated = after.find((p) => p.id === candidate.id);
  if (!updated) {
    throw new Error(
      'Post disappeared from listPosts after reschedule — check Zernio directly',
    );
  }
  console.log(`[step 2] post.scheduledFor=${updated.scheduledFor}`);

  // Zernio may round / normalize the timestamp. Tolerate up to 60s drift.
  const reportedMs = updated.scheduledFor
    ? new Date(updated.scheduledFor).getTime()
    : 0;
  const driftMs = Math.abs(reportedMs - new Date(bumpedIso).getTime());
  if (driftMs > 60_000) {
    throw new Error(
      `Reschedule did not stick: expected ~${bumpedIso}, got ${updated.scheduledFor}`,
    );
  }
  console.log(
    `[step 2] PASS — drift ${driftMs}ms (tolerance 60_000ms)`,
  );

  console.log('\n[step 3] reset back to original time');
  await service.reschedulePost(candidate.id, originalIso);
  console.log(`[step 3] OK — restored to ${originalIso}`);

  console.log('\n[done] reschedulePost verified end-to-end against live Zernio API.');
}

main().catch((err) => {
  console.error('test failed:', err);
  process.exit(1);
});
