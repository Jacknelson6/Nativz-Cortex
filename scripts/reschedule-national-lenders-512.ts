/**
 * One-off: pull the National Lenders post currently sitting on 2026-05-13
 * 17:00 UTC forward to 2026-05-12 17:00 UTC so there's a post on the books
 * for the day before the client meeting. The 2026-05-11 post is already
 * queued on Zernio for today's noon-CDT slot, so this single shift gives
 * us two visible posts (today + tomorrow).
 *
 * Side effect: the every-other-day cadence drops a slot on 2026-05-13.
 * The 2026-05-15 post and beyond stay at their original times.
 *
 * Run with: npx tsx scripts/reschedule-national-lenders-512.ts
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

const POST_ID = '44979bd9-9032-48aa-bb04-b62f82a8ed9d';
const NEW_TIME = '2026-05-12T17:00:00.000Z'; // 12 PM CDT on 2026-05-12

async function main() {
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const { getPostingService } = await import('@/lib/posting');

  const admin = createAdminClient();
  const service = getPostingService();

  const { data: post, error: readErr } = await admin
    .from('scheduled_posts')
    .select('id, status, scheduled_at, late_post_id, client_id')
    .eq('id', POST_ID)
    .single();

  if (readErr || !post) {
    throw new Error(`Couldn't read post ${POST_ID}: ${readErr?.message}`);
  }
  console.log(
    `[pre] post.status=${post.status} scheduled_at=${post.scheduled_at} late_post_id=${post.late_post_id ?? 'null'}`,
  );

  if (post.status !== 'scheduled') {
    throw new Error(
      `Post is in status '${post.status}' — only 'scheduled' is safe to bump`,
    );
  }
  if (!post.late_post_id) {
    throw new Error(
      'Post has no late_post_id — Zernio never accepted it. Aborting before partial state.',
    );
  }

  console.log(`[step 1] Zernio.reschedulePost → ${NEW_TIME}`);
  await service.reschedulePost(post.late_post_id, NEW_TIME);
  console.log('[step 1] OK');

  console.log('[step 2] update DB scheduled_at');
  const { error: updateErr } = await admin
    .from('scheduled_posts')
    .update({
      scheduled_at: NEW_TIME,
      updated_at: new Date().toISOString(),
    })
    .eq('id', POST_ID);
  if (updateErr) {
    throw new Error(`DB update failed: ${updateErr.message}`);
  }
  console.log('[step 2] OK');

  console.log('[done] post pulled forward to 2026-05-12 17:00 UTC');
}

main().catch((err) => {
  console.error('reschedule failed:', err);
  process.exit(1);
});
