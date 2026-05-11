/**
 * Avondale has six 5 AM CDT (10:00 UTC) posts on the calendar, every
 * one of which lands on the same day as a 12 PM CDT post for the same
 * client. That's double-posting on Facebook. Standard is one post per
 * day at noon Central, so the early-morning slot is the bug.
 *
 * This script:
 *  1. Finds every Avondale in-flight post scheduled at 10:00 UTC.
 *  2. For 'scheduled' ones: cancels each Zernio post (DELETE the
 *     external posts via service.deletePost so they don't fire).
 *  3. Deletes the scheduled_post_platforms rows for those posts.
 *  4. Deletes the scheduled_posts rows themselves.
 *  5. For 'draft' ones: just deletes from Cortex (drafts haven't been
 *     handed to Zernio yet).
 *
 * Captions on the deleted posts are not preserved. If the team wants
 * to recover that content, they can pull it from the post_id list in
 * the output and reschedule on a fresh slot.
 *
 * Run:
 *   npx tsx scripts/cleanup-avondale-doubleposts.ts          # dry run
 *   npx tsx scripts/cleanup-avondale-doubleposts.ts --apply  # write
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

const CLIENT_ID = 'fb8a1a10-166c-43e7-bd13-981486095cb4';

async function main() {
  const apply = process.argv.includes('--apply');
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const { getPostingService } = await import('@/lib/posting');
  const admin = createAdminClient();
  const service = getPostingService();

  const { data: posts } = await admin
    .from('scheduled_posts')
    .select(
      'id, scheduled_at, status, caption, scheduled_post_platforms(id, external_post_id)',
    )
    .eq('client_id', CLIENT_ID)
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true });

  // Filter to posts whose scheduled_at is at 10:00 UTC (the bug slot).
  const targets = (posts ?? []).filter((p) => {
    const iso = p.scheduled_at as string;
    return iso.slice(11, 16) === '10:00';
  });

  console.log(`[targets] ${targets.length} 5 AM CDT (10:00 UTC) Avondale posts:`);
  for (const t of targets) {
    const when = (t.scheduled_at as string).slice(0, 16).replace('T', ' ');
    const ext = ((t.scheduled_post_platforms ?? []) as Array<{
      external_post_id: string | null;
    }>)
      .map((l) => l.external_post_id)
      .filter((x): x is string => Boolean(x));
    console.log(
      `  ${when} UTC  status=${t.status}  legs=${(t.scheduled_post_platforms ?? []).length}  zernio_ids=[${ext.join(',') || '-'}]`,
    );
  }

  if (!apply) {
    console.log('\n[dry run] pass --apply to delete.');
    return;
  }

  let zernioCancelled = 0;
  let zernioFailed = 0;
  let legsDeleted = 0;
  let postsDeleted = 0;

  for (const t of targets) {
    // 1. Cancel Zernio posts (unique externalPostIds) if scheduled
    if (t.status === 'scheduled') {
      const externalIds = Array.from(
        new Set(
          ((t.scheduled_post_platforms ?? []) as Array<{
            external_post_id: string | null;
          }>)
            .map((l) => l.external_post_id)
            .filter((x): x is string => Boolean(x)),
        ),
      );
      for (const ext of externalIds) {
        try {
          await service.deletePost(ext);
          zernioCancelled += 1;
          console.log(`  [zernio] cancelled ${ext}`);
        } catch (err) {
          zernioFailed += 1;
          const msg = err instanceof Error ? err.message : String(err);
          console.log(`  [zernio] FAILED to cancel ${ext}: ${msg}`);
        }
      }
    }

    // 2. Delete scheduled_post_platforms rows
    const legIds = ((t.scheduled_post_platforms ?? []) as Array<{ id: string }>).map(
      (l) => l.id as string,
    );
    if (legIds.length > 0) {
      const { error: lErr } = await admin
        .from('scheduled_post_platforms')
        .delete()
        .in('id', legIds);
      if (lErr) {
        console.log(`  [legs] FAILED ${t.id}: ${lErr.message}`);
        continue;
      }
      legsDeleted += legIds.length;
    }

    // 3. Delete scheduled_posts row
    const { error: pErr } = await admin
      .from('scheduled_posts')
      .delete()
      .eq('id', t.id);
    if (pErr) {
      console.log(`  [post] FAILED ${t.id}: ${pErr.message}`);
      continue;
    }
    postsDeleted += 1;
    console.log(`  [post] deleted ${t.id}`);
  }

  console.log(
    `\n[summary] Zernio cancelled=${zernioCancelled} failed=${zernioFailed}  legs deleted=${legsDeleted}  posts deleted=${postsDeleted}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
