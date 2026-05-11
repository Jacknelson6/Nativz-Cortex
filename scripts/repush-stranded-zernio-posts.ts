// One-off: re-push approved drop posts that landed in `status='scheduled'`
// without a `late_post_id`. Symptom: post sits in Cortex's queue but Zernio
// never received it, so it won't appear on Zernio's dashboard. The publish
// cron would eventually pick them up at scheduled_at, but pushing now buys
// us platform-side scheduling reliability + visibility in Zernio.
//
// Strategy: flip status back to 'draft' (the only state `publishScheduledPost`
// will operate on), then call `publishScheduledPost` which atomically flips
// to 'publishing', pushes to Zernio, and stamps late_post_id + 'scheduled'.
//
// Run with: npx tsx scripts/repush-stranded-zernio-posts.ts

import { config as dotenv } from 'dotenv';
dotenv({ path: '.env.local' });

const TARGETS = [
  // Skibell Fine Jewelry — May 12-30 (batch reset on May 4 17:52 UTC, cause unknown)
  'f60a2933-b58c-485b-b428-aef276dbd667',
  '0d7173a8-0f2f-4783-8746-78b3f05a9873',
  '9b1b64ac-3741-448a-a024-98e46f4d6a3a',
  'cd54565c-c89c-47ad-b52b-d4960be16bc4',
  '9584bfa1-dadd-42e3-9257-f74fda764209',
  '5c8328a8-417c-4811-b0bc-8d8ab304faae',
  '5bb5fbec-fff1-4127-ac38-83622224c89f',
  '9dafefd8-d102-4147-aa8e-5a07cc99bee6',
  // EcoView — May 13 (today's cron probe-don't-republish path)
  '7fb93604-42e4-46db-81e3-763caa144c4c',
];

async function main() {
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const { publishScheduledPost } = await import('@/lib/calendar/schedule-drop');

  const admin = createAdminClient();
  const results: { id: string; ok: boolean; detail: string }[] = [];

  for (const postId of TARGETS) {
    try {
      // Safety re-check: only act on rows that are stranded
      // (status='scheduled', late_post_id null). Avoids racing the cron.
      const { data: row } = await admin
        .from('scheduled_posts')
        .select('id, status, late_post_id, scheduled_at')
        .eq('id', postId)
        .maybeSingle<{
          id: string;
          status: string;
          late_post_id: string | null;
          scheduled_at: string;
        }>();
      if (!row) {
        results.push({ id: postId, ok: false, detail: 'row not found' });
        continue;
      }
      if (row.late_post_id) {
        results.push({ id: postId, ok: true, detail: `already pushed: ${row.late_post_id}` });
        continue;
      }
      if (row.status !== 'scheduled') {
        results.push({ id: postId, ok: false, detail: `unexpected status ${row.status}` });
        continue;
      }

      // Flip to draft so publishScheduledPost's CAS will accept it.
      const { error: resetErr } = await admin
        .from('scheduled_posts')
        .update({ status: 'draft', updated_at: new Date().toISOString() })
        .eq('id', postId)
        .eq('status', 'scheduled')
        .is('late_post_id', null);
      if (resetErr) {
        results.push({ id: postId, ok: false, detail: `reset failed: ${resetErr.message}` });
        continue;
      }

      const out = await publishScheduledPost(admin, postId);
      results.push({
        id: postId,
        ok: true,
        detail: out.alreadyPublished
          ? `alreadyPublished externalPostId=${out.externalPostId ?? '?'}`
          : `pushed externalPostId=${out.externalPostId ?? '?'}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ id: postId, ok: false, detail: msg });
      // Best-effort revert to scheduled so the cron can still try later.
      await admin
        .from('scheduled_posts')
        .update({ status: 'scheduled', updated_at: new Date().toISOString() })
        .eq('id', postId)
        .eq('status', 'draft');
    }
  }

  console.log('\n=== results ===');
  for (const r of results) {
    console.log(`${r.ok ? 'OK ' : 'ERR'} ${r.id}  ${r.detail}`);
  }
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} ok`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
