/**
 * One-shot scheduler for Avondale Private Lending's May content calendar.
 *
 *   npx tsx scripts/schedule-avondale-may.ts <dropId> [--dry]
 *
 * Why a script (vs the UI button):
 *   Avondale only has Facebook connected to Zernio. The DB also shows TikTok
 *   wired in, but Jack confirmed that's stale — TT is NOT actually connected.
 *   The UI's schedule button pushes to every connected platform, so we'd
 *   accidentally try to publish to TT and fail (or worse, succeed). This
 *   script forces platforms=['facebook'] so the new platforms filter in
 *   schedule-drop.ts scopes Zernio publish to FB only.
 *
 * Flow:
 *   1. Loads the drop, prints status + per-video preview captions
 *   2. (--dry) stops here so you can review before pushing
 *   3. Otherwise calls scheduleDrop with platforms: ['facebook']
 *   4. Prints scheduled/failed counts and any per-video errors
 *
 * Pre-reqs:
 *   • The drop ingested successfully (status='ready', all videos status='ready')
 *   • Captions were generated and look right at /admin/calendar/[id]
 *
 * After it runs:
 *   • Posts appear in /admin/scheduler with status=scheduled
 *   • Zernio receives the publish call and queues for FB at the slot times
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
  const dry = process.argv.includes('--dry');
  if (!dropId) {
    console.error('Usage: npx tsx scripts/schedule-avondale-may.ts <dropId> [--dry]');
    process.exit(1);
  }

  const { createAdminClient } = await import('@/lib/supabase/admin');
  const { scheduleDrop } = await import('@/lib/calendar/schedule-drop');
  const admin = createAdminClient();

  const { data: drop, error: dropErr } = await admin
    .from('content_drops')
    .select('id, client_id, status, start_date, end_date, default_post_time')
    .eq('id', dropId)
    .single();
  if (dropErr || !drop) {
    console.error('✗ Drop not found:', dropErr?.message);
    process.exit(1);
  }
  console.log(`Drop ${drop.id}`);
  console.log(`  status: ${drop.status}`);
  console.log(`  window: ${drop.start_date} → ${drop.end_date}, default ${drop.default_post_time}`);

  const { data: videos } = await admin
    .from('content_drop_videos')
    .select('id, drive_file_name, status, draft_caption, draft_hashtags, order_index')
    .eq('drop_id', dropId)
    .order('order_index');

  console.log(`  videos: ${videos?.length ?? 0}`);
  for (const v of videos ?? []) {
    const cap = (v.draft_caption ?? '').slice(0, 120).replace(/\n/g, ' ');
    console.log(`  ${String(v.order_index).padStart(2, '0')} [${v.status}] ${v.drive_file_name}`);
    console.log(`     ${cap}${(v.draft_caption ?? '').length > 120 ? '…' : ''}`);
    if (v.draft_hashtags?.length) {
      console.log(`     #${(v.draft_hashtags as string[]).join(' #')}`);
    }
  }

  if (drop.status !== 'ready') {
    console.error(`\n✗ Cannot schedule — drop status is '${drop.status}', need 'ready'.`);
    console.error('  Wait for ingest + caption-gen to finish, or fix any failed videos at /admin/calendar/' + drop.id);
    process.exit(1);
  }

  if (dry) {
    console.log('\n— Dry run, stopping before scheduleDrop call.');
    return;
  }

  console.log('\n→ Scheduling to Facebook only (skipping any other connected platforms)…');
  const result = await scheduleDrop(admin, {
    dropId: drop.id,
    platforms: ['facebook'],
  });

  console.log(`\n✓ Scheduled: ${result.scheduled}`);
  console.log(`  Failed:    ${result.failed}`);
  if (result.errors.length > 0) {
    console.log('\nErrors:');
    for (const e of result.errors) {
      console.log(`  • ${e.videoId}: ${e.reason}`);
    }
  }
}

main().catch((err) => {
  console.error('Schedule failed:', err);
  process.exit(1);
});
