/**
 * Repair Avondale's broken social_profiles + zombie legs.
 *
 *  1. Update the IG social_profile to point at the real Zernio account
 *     id (6a01dc2f92b3d8e85fc0e51c) and the canonical username
 *     (avondale_private_lending).
 *  2. Mark the YT social_profile is_active=false — Zernio doesn't
 *     have a YT account on this profile, so it was never going to
 *     publish. Leaving it inactive (vs deleting) keeps historical
 *     references intact.
 *  3. Delete the 6 zombie IG legs (scheduled_post_platforms rows that
 *     point at the broken IG profile and have no external_post_id).
 *     These never made it into a real Zernio post and would otherwise
 *     stay "pending" forever.
 *
 * Run:
 *   npx tsx scripts/fix-avondale-state.ts          # dry run
 *   npx tsx scripts/fix-avondale-state.ts --apply  # write
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
const IG_LATE_ACCOUNT_ID = '6a01dc2f92b3d8e85fc0e51c';
const IG_USERNAME = 'avondale_private_lending';

async function main() {
  const apply = process.argv.includes('--apply');
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const admin = createAdminClient();

  const { data: profiles } = await admin
    .from('social_profiles')
    .select('id, platform, late_account_id, username, is_active')
    .eq('client_id', CLIENT_ID);

  const ig = (profiles ?? []).find((p) => p.platform === 'instagram');
  const yt = (profiles ?? []).find((p) => p.platform === 'youtube');
  if (!ig) throw new Error('No IG row found for Avondale');
  if (!yt) throw new Error('No YT row found for Avondale');

  console.log(`[plan] IG ${ig.id}: set late_account_id=${IG_LATE_ACCOUNT_ID}, username=${IG_USERNAME}`);
  console.log(`[plan] YT ${yt.id}: set is_active=false (Zernio has no YT account on this profile)`);

  const { data: zombieLegs } = await admin
    .from('scheduled_post_platforms')
    .select('id, post_id, status, external_post_id')
    .eq('social_profile_id', ig.id)
    .is('external_post_id', null);
  console.log(`[plan] delete ${zombieLegs?.length ?? 0} zombie IG legs (null external_post_id)`);
  for (const z of zombieLegs ?? []) {
    console.log(`    - leg ${z.id} on post ${z.post_id}`);
  }

  if (!apply) {
    console.log('\n[dry run] pass --apply to write.');
    return;
  }

  const { error: igErr } = await admin
    .from('social_profiles')
    .update({
      late_account_id: IG_LATE_ACCOUNT_ID,
      platform_user_id: IG_LATE_ACCOUNT_ID,
      username: IG_USERNAME,
      is_active: true,
      token_status: 'valid',
    })
    .eq('id', ig.id);
  if (igErr) throw new Error(`IG update: ${igErr.message}`);
  console.log('[apply] IG repaired.');

  const { error: ytErr } = await admin
    .from('social_profiles')
    .update({ is_active: false })
    .eq('id', yt.id);
  if (ytErr) throw new Error(`YT update: ${ytErr.message}`);
  console.log('[apply] YT marked inactive.');

  if ((zombieLegs?.length ?? 0) > 0) {
    const ids = (zombieLegs ?? []).map((z) => z.id as string);
    const { error: delErr } = await admin
      .from('scheduled_post_platforms')
      .delete()
      .in('id', ids);
    if (delErr) throw new Error(`leg delete: ${delErr.message}`);
    console.log(`[apply] deleted ${ids.length} zombie IG legs.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
