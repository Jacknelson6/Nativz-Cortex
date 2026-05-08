/**
 * One-shot: re-fire stuck Skibell Mother's Day post (2026-05-08 4:19 PM CT)
 * legs that didn't ship through Zernio.
 *
 *   npx tsx scripts/force-publish-skibell-mothers-day.ts
 *
 * Final state at script time, per `getPostStatus` against Zernio:
 *   - TikTok ✅ published natively (7637625392089681166)
 *   - YouTube ✅ published natively (fo_a7GwDFdY) — on a separate Zernio post
 *   - Facebook ❌ "response too large" (Zernio→Graph API parser error, terminal)
 *   - Instagram ⏳ Zernio reports "scheduled" but ~5h past due — Zernio scheduler stuck
 *
 * The cron's dupe-guard probes Zernio first; while Zernio still says IG is
 * "scheduled," it stays in probe-only mode and never re-fires. Force re-fire
 * by:
 *   1. Cancel the original Zernio post (stops IG from firing accidentally
 *      later from Zernio's queue).
 *   2. Clear our scheduled_posts.late_post_id + reset FB/IG legs to pending.
 *   3. Trigger publish-cron — per-leg retry will only re-fire FB+IG (TT+YT
 *      stay protected by the `if (status !== 'pending' && status !== 'failed')
 *      return null` filter).
 */
import path from 'node:path';
import fs from 'node:fs';

for (const candidate of [
  path.resolve(process.cwd(), '.env.local'),
  '/Users/jack/Claude Code Projects/Nativz Cortex/.env.local',
]) {
  if (fs.existsSync(candidate)) {
    for (const line of fs.readFileSync(candidate, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

const POST_ID = '69485fae-668c-4ca5-928e-ed88f6c780a4';
const LATE_POST_ID = '69fe4bc5d9512b0369d9a78c';

async function main() {
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const { getPostingService } = await import('@/lib/posting');

  const admin = createAdminClient();
  const service = getPostingService();

  console.log('1. Cancelling original Zernio post', LATE_POST_ID);
  try {
    await service.deletePost(LATE_POST_ID);
    console.log('   → cancelled');
  } catch (err) {
    console.warn('   → delete failed (probably already cancelled or status forbids); continuing.', err);
  }

  console.log('2. Clearing late_post_id on parent row');
  await admin
    .from('scheduled_posts')
    .update({
      late_post_id: null,
      status: 'scheduled',
      retry_count: 0,
      failure_reason: null,
      health_alerted_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', POST_ID);

  console.log('3. Resetting FB + IG legs to pending');
  const { data: legs } = await admin
    .from('scheduled_post_platforms')
    .select('id, status, social_profiles:social_profile_id(platform)')
    .eq('post_id', POST_ID);

  for (const leg of (legs ?? []) as Array<{
    id: string;
    status: string;
    social_profiles: { platform: string } | { platform: string }[] | null;
  }>) {
    const sp = leg.social_profiles;
    const platform = Array.isArray(sp) ? sp[0]?.platform : sp?.platform;
    if (platform === 'facebook' || platform === 'instagram') {
      await admin
        .from('scheduled_post_platforms')
        .update({
          status: 'pending',
          external_post_id: null,
          external_post_url: null,
          failure_reason: null,
        })
        .eq('id', leg.id);
      console.log(`   → ${platform} reset to pending`);
    }
  }

  console.log('4. Verifying state pre-cron');
  const { data: after } = await admin
    .from('scheduled_post_platforms')
    .select('status, social_profiles:social_profile_id(platform)')
    .eq('post_id', POST_ID);
  console.log(JSON.stringify(after, null, 2));

  console.log('\nDone. Hit /api/cron/publish-posts (Bearer CRON_SECRET) to fire now.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
