/**
 * Respread an existing drop's scheduled posts evenly across a new
 * start/end window. Use when a calendar was created with too short a
 * range (posts bunched <2 days apart) and we want to widen it without
 * reingesting media.
 *
 *   npx tsx scripts/respread-drop.ts <dropId> <startDate> <endDate>
 *   npx tsx scripts/respread-drop.ts 5fc0ad82-... 2026-05-05 2026-05-31
 *
 * The new-drop dialog already defaults end_date to the end of the start
 * month, so freshly-created drops shouldn't need this. Reach for it only
 * to fix legacy drops that were narrowed by hand.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createAdminClient } from '@/lib/supabase/admin';
import { distributeSlots } from '@/lib/calendar/distribute-slots';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_TIME = '12:00';

async function main() {
  const [, , dropId, startDate, endDate] = process.argv;
  if (!dropId || !startDate || !endDate) {
    throw new Error('usage: npx tsx scripts/respread-drop.ts <dropId> <YYYY-MM-DD> <YYYY-MM-DD>');
  }
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
    throw new Error('dates must be YYYY-MM-DD');
  }

  const admin = createAdminClient();

  console.log(`— Bumping drop ${dropId} to ${startDate} → ${endDate}`);
  const { error: dropErr } = await admin
    .from('content_drops')
    .update({ start_date: startDate, end_date: endDate })
    .eq('id', dropId);
  if (dropErr) throw new Error(`drop update: ${dropErr.message}`);

  console.log('— Loading drop posts (ordered)');
  const { data: rows, error: rowsErr } = await admin
    .from('content_drop_videos')
    .select('id, scheduled_post_id, order_index')
    .eq('drop_id', dropId)
    .not('scheduled_post_id', 'is', null)
    .order('order_index', { ascending: true });
  if (rowsErr) throw new Error(`videos query: ${rowsErr.message}`);
  const posts = rows ?? [];
  if (posts.length === 0) throw new Error('no scheduled posts on this drop');
  console.log(`  ${posts.length} posts`);

  const slots = distributeSlots({
    count: posts.length,
    startDate,
    endDate,
    defaultTime: DEFAULT_TIME,
  });

  console.log('— New slots:');
  for (let i = 0; i < posts.length; i++) {
    console.log(`  #${i + 1} ${posts[i].scheduled_post_id} → ${slots[i]}`);
  }

  console.log('— Updating scheduled_posts.scheduled_at + content_drop_videos.draft_scheduled_at');
  for (let i = 0; i < posts.length; i++) {
    const row = posts[i];
    const slot = slots[i];
    const { error: postErr } = await admin
      .from('scheduled_posts')
      .update({ scheduled_at: slot, updated_at: new Date().toISOString() })
      .eq('id', row.scheduled_post_id as string);
    if (postErr) throw new Error(`post ${row.scheduled_post_id}: ${postErr.message}`);

    const { error: vidErr } = await admin
      .from('content_drop_videos')
      .update({ draft_scheduled_at: slot })
      .eq('id', row.id);
    if (vidErr) throw new Error(`video ${row.id}: ${vidErr.message}`);
  }

  console.log(`\n✓ done. Drop ${dropId} respread across ${startDate} → ${endDate}.`);
}

main().catch((err) => {
  console.error('\n✗ respread failed:', err);
  process.exit(1);
});
