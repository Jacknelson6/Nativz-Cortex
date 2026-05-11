/**
 * Repair: yesterday's bulk-draft cleanup deleted scheduled_posts that
 * were the backing rows for live share-link calendar entries on 8
 * clients. The content_drop_videos rows survived (FK was ON DELETE
 * SET NULL) so we still have draft_caption, draft_scheduled_at, and
 * the scheduler_media linkage by filename, but the post + platform
 * legs + post_media rows are gone.
 *
 * This script reconstructs them so the existing share links show
 * captions + schedule again.
 *
 * Per-orphan steps:
 *   1. Find scheduler_media row by (client_id, filename = drive_file_name).
 *   2. Pick target platforms:
 *        a. If a sibling drop_video in the same drop still has a
 *           scheduled_post, read its platforms and reuse them.
 *        b. Otherwise fall back to the client's active social_profiles.
 *   3. Insert scheduled_posts(status='draft', client_id, scheduled_at,
 *      caption, hashtags) using the drop_video's draft_* fields.
 *   4. Insert scheduled_post_media row pointing at the scheduler_media.
 *   5. Insert one scheduled_post_platforms row per target platform
 *      (status='pending', no external_post_id — these are drafts).
 *   6. UPDATE content_drop_videos.scheduled_post_id to the new row.
 *
 * Skips:
 *   - Avondale 5 AM CDT orphans (the bug slot already cleaned up).
 *   - Orphans with no draft_scheduled_at (never finalized).
 *
 * Run:
 *   npx tsx scripts/restore-orphaned-drop-videos.ts          # dry run
 *   npx tsx scripts/restore-orphaned-drop-videos.ts --apply  # write
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

// The 5 AM CDT slot (10:00 UTC) on Avondale is the double-post bug we
// just cleaned. Don't restore anything that lands in that slot.
const AVONDALE_CLIENT_ID = 'fb8a1a10-166c-43e7-bd13-981486095cb4';
const BUG_TIME_UTC = '10:00';

type OrphanRow = {
  drop_video_id: string;
  drop_id: string;
  client_id: string;
  client_name: string;
  drive_file_name: string;
  draft_caption: string | null;
  draft_hashtags: string[] | null;
  draft_scheduled_at: string | null;
};

async function main() {
  const apply = process.argv.includes('--apply');
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const admin = createAdminClient();

  // 1. Load all orphans with the joins we need.
  const { data: orphansRaw, error: orphanErr } = await admin
    .from('content_drop_videos')
    .select(
      `id, drop_id, drive_file_name, draft_caption, draft_hashtags, draft_scheduled_at,
       content_drops!inner(id, client_id, status, created_at,
         clients!inner(id, name))`,
    )
    .is('scheduled_post_id', null);
  if (orphanErr) throw new Error(`orphans: ${orphanErr.message}`);

  type RawOrphan = {
    id: string;
    drop_id: string;
    drive_file_name: string;
    draft_caption: string | null;
    draft_hashtags: string[] | null;
    draft_scheduled_at: string | null;
    content_drops: {
      id: string;
      client_id: string;
      status: string;
      created_at: string;
      clients: { id: string; name: string };
    };
  };

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const orphans: OrphanRow[] = ((orphansRaw ?? []) as unknown as RawOrphan[])
    .filter((r) => new Date(r.content_drops.created_at) >= ninetyDaysAgo)
    .map((r) => ({
      drop_video_id: r.id,
      drop_id: r.drop_id,
      client_id: r.content_drops.client_id,
      client_name: r.content_drops.clients.name,
      drive_file_name: r.drive_file_name,
      draft_caption: r.draft_caption,
      draft_hashtags: r.draft_hashtags,
      draft_scheduled_at: r.draft_scheduled_at,
    }));

  // 2. Filter: must have a draft_scheduled_at, not the Avondale bug slot.
  const skipNoSchedule = orphans.filter((o) => !o.draft_scheduled_at);
  const skipBugSlot = orphans.filter(
    (o) =>
      o.client_id === AVONDALE_CLIENT_ID &&
      o.draft_scheduled_at?.slice(11, 16) === BUG_TIME_UTC,
  );
  const restorable = orphans.filter(
    (o) =>
      !!o.draft_scheduled_at &&
      !(
        o.client_id === AVONDALE_CLIENT_ID &&
        o.draft_scheduled_at.slice(11, 16) === BUG_TIME_UTC
      ),
  );

  console.log(`[scope] ${orphans.length} total orphans (${skipNoSchedule.length} no schedule, ${skipBugSlot.length} Avondale bug slot, ${restorable.length} to restore)`);

  // Group restorables by client for the platform fallback.
  const byClient = new Map<string, OrphanRow[]>();
  for (const o of restorable) {
    if (!byClient.has(o.client_id)) byClient.set(o.client_id, []);
    byClient.get(o.client_id)!.push(o);
  }

  // 3. Target platforms = the client's currently-active social_profiles.
  //    This matches the operating rule ("post on every connected platform")
  //    and avoids the sibling-pattern foot-gun where an old leg row would
  //    under-represent the current platform set.
  const clientPlatformProfiles = new Map<string, string[]>(); // client_id -> social_profile_ids
  const affectedClientIds = [...new Set(restorable.map((o) => o.client_id))];
  for (const clientId of affectedClientIds) {
    const { data: profiles } = await admin
      .from('social_profiles')
      .select('id')
      .eq('client_id', clientId)
      .eq('is_active', true);
    clientPlatformProfiles.set(
      clientId,
      (profiles ?? []).map((p) => p.id as string),
    );
  }
  const dropPlatformProfiles = new Map<string, string[]>(); // drop_id -> profile_ids
  for (const o of restorable) {
    if (dropPlatformProfiles.has(o.drop_id)) continue;
    dropPlatformProfiles.set(
      o.drop_id,
      clientPlatformProfiles.get(o.client_id) ?? [],
    );
  }

  // Print plan.
  console.log('\n[plan] per-drop platform targets:');
  for (const [dropId, profileIds] of dropPlatformProfiles) {
    const sample = restorable.find((o) => o.drop_id === dropId)!;
    const orphanCount = restorable.filter((o) => o.drop_id === dropId).length;
    console.log(
      `  ${sample.client_name} drop=${dropId.slice(0, 8)}  orphans=${orphanCount}  profiles=${profileIds.length}`,
    );
  }

  if (skipBugSlot.length > 0) {
    console.log(`\n[skip] ${skipBugSlot.length} Avondale 10:00 UTC orphans (bug slot):`);
    for (const o of skipBugSlot) {
      console.log(`  ${o.draft_scheduled_at} ${o.drive_file_name}`);
    }
  }
  if (skipNoSchedule.length > 0) {
    console.log(`\n[skip] ${skipNoSchedule.length} orphans without draft_scheduled_at:`);
    for (const o of skipNoSchedule) {
      console.log(`  ${o.client_name} ${o.drive_file_name}`);
    }
  }

  if (!apply) {
    console.log('\n[dry run] pass --apply to restore.');
    return;
  }

  // 4. Restore each orphan in a per-row transaction (best-effort: do
  //    each step sequentially; if media or platforms fail, stop and
  //    surface the error so we can debug).
  let restored = 0;
  let failed = 0;

  for (const o of restorable) {
    const profileIds = dropPlatformProfiles.get(o.drop_id) ?? [];
    if (profileIds.length === 0) {
      console.log(`  [skip] ${o.drop_video_id} (no platforms determinable)`);
      failed += 1;
      continue;
    }

    // Find scheduler_media by (client_id, filename).
    const { data: media } = await admin
      .from('scheduler_media')
      .select('id')
      .eq('client_id', o.client_id)
      .eq('filename', o.drive_file_name)
      .maybeSingle();
    if (!media) {
      console.log(`  [skip] ${o.drop_video_id} (no scheduler_media for "${o.drive_file_name}")`);
      failed += 1;
      continue;
    }

    // Insert scheduled_posts.
    const { data: newPost, error: pErr } = await admin
      .from('scheduled_posts')
      .insert({
        client_id: o.client_id,
        status: 'draft',
        scheduled_at: o.draft_scheduled_at,
        caption: o.draft_caption ?? '',
        hashtags: o.draft_hashtags ?? [],
        post_type: 'video',
      })
      .select('id')
      .single();
    if (pErr || !newPost) {
      console.log(`  [fail] post insert ${o.drop_video_id}: ${pErr?.message}`);
      failed += 1;
      continue;
    }

    // Insert scheduled_post_media.
    const { error: smErr } = await admin
      .from('scheduled_post_media')
      .insert({ post_id: newPost.id, media_id: media.id, sort_order: 0 });
    if (smErr) {
      console.log(`  [fail] media link ${o.drop_video_id}: ${smErr.message}`);
      failed += 1;
      continue;
    }

    // Insert platform legs.
    const legRows = profileIds.map((pid) => ({
      post_id: newPost.id,
      social_profile_id: pid,
      status: 'pending',
    }));
    const { error: legErr } = await admin
      .from('scheduled_post_platforms')
      .insert(legRows);
    if (legErr) {
      console.log(`  [fail] legs ${o.drop_video_id}: ${legErr.message}`);
      failed += 1;
      continue;
    }

    // Reconnect drop_video.
    const { error: cdvErr } = await admin
      .from('content_drop_videos')
      .update({ scheduled_post_id: newPost.id })
      .eq('id', o.drop_video_id);
    if (cdvErr) {
      console.log(`  [fail] drop_video update ${o.drop_video_id}: ${cdvErr.message}`);
      failed += 1;
      continue;
    }

    restored += 1;
    console.log(
      `  [ok] ${o.client_name} ${o.draft_scheduled_at} ${o.drive_file_name} -> ${newPost.id}`,
    );
  }

  console.log(`\n[summary] restored=${restored} failed=${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
