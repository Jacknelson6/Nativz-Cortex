/**
 * Re-run caption generation for an existing content calendar so the new
 * `saved_captions` tone anchors take effect on already-scheduled videos.
 *
 *   npx tsx scripts/regen-captions-for-drop.ts <dropId>
 *
 * What it does:
 *   1. Flips every `content_drop_videos` row in the drop back to status
 *      'caption_pending' (clears draft_caption / draft_hashtags).
 *   2. Calls generateDropCaptions(...) — that pulls the latest top-10
 *      saved_captions for the client and writes new draft_caption +
 *      draft_hashtags + caption_score, then sets status back to 'ready'.
 *   3. Propagates the new draft_caption / draft_hashtags onto the linked
 *      scheduled_posts rows so the public share link reflects the change.
 */

import fs from 'node:fs';
import path from 'node:path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

async function main() {
  const dropId = process.argv[2];
  if (!dropId) {
    console.error('Usage: npx tsx scripts/regen-captions-for-drop.ts <dropId>');
    process.exit(1);
  }

  const { createAdminClient } = await import('@/lib/supabase/admin');
  const { generateDropCaptions } = await import('@/lib/calendar/generate-caption');
  const admin = createAdminClient();

  // 1. Resolve drop -> client_id + an admin user to attribute LLM calls to
  console.log(`→ Loading drop ${dropId}`);
  const { data: drop, error: dropErr } = await admin
    .from('content_drops')
    .select('id, client_id, created_by')
    .eq('id', dropId)
    .single();
  if (dropErr || !drop) {
    console.error('✗ Could not load drop:', dropErr);
    process.exit(1);
  }
  console.log(`  ✓ client_id=${drop.client_id}`);

  const { data: adminUser } = await admin
    .from('users')
    .select('id, email')
    .eq('id', drop.created_by)
    .maybeSingle();
  const userId = adminUser?.id ?? drop.created_by;
  const userEmail = adminUser?.email ?? undefined;

  // 2. Reset every video in the drop to caption_pending
  console.log('\nStep 1 — Reset videos to caption_pending');
  const { data: videos, error: videoErr } = await admin
    .from('content_drop_videos')
    .update({
      status: 'caption_pending',
      draft_caption: null,
      draft_hashtags: null,
      caption_score: null,
      caption_iterations: 0,
      error_detail: null,
    })
    .eq('drop_id', dropId)
    .select('id, scheduled_post_id');
  if (videoErr) {
    console.error('✗ Failed to reset videos:', videoErr);
    process.exit(1);
  }
  console.log(`  ✓ Reset ${videos?.length ?? 0} videos`);

  // 3. Regenerate captions — uses fresh saved_captions automatically
  console.log('\nStep 2 — Generate captions with new tone anchors');
  const result = await generateDropCaptions(admin, {
    dropId,
    clientId: drop.client_id,
    userId,
    userEmail,
  });
  console.log(`  ✓ Generated ${result.generated}, failed ${result.failed}`);

  // 4. Propagate the freshly-written draft_caption -> scheduled_posts.caption
  console.log('\nStep 3 — Propagate captions to scheduled_posts');
  const { data: ready } = await admin
    .from('content_drop_videos')
    .select('scheduled_post_id, draft_caption, draft_hashtags')
    .eq('drop_id', dropId)
    .eq('status', 'ready');

  let updated = 0;
  for (const v of ready ?? []) {
    if (!v.scheduled_post_id || !v.draft_caption) continue;
    const { error: upErr } = await admin
      .from('scheduled_posts')
      .update({
        caption: v.draft_caption,
        hashtags: v.draft_hashtags ?? [],
      })
      .eq('id', v.scheduled_post_id);
    if (upErr) {
      console.error(`  ✗ Failed to update post ${v.scheduled_post_id}:`, upErr.message);
      continue;
    }
    updated += 1;
  }
  console.log(`  ✓ Updated ${updated} scheduled_posts rows`);

  console.log('\n✓ Done. Reload the public share link to see the new captions.');
}

main().catch((err) => {
  console.error('\n✗ Unhandled:', err);
  if (err instanceof Error) console.error(err.stack);
  process.exit(1);
});
