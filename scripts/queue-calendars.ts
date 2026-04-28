/**
 * Overnight content-calendar queue.
 *
 * Reads a JSON config of {clientSlug, driveFolderUrl, startDate, endDate,
 * platforms?} entries and runs the full pipeline per client:
 *
 *   listVideos → content_drops + videos → ingest → analyze → caption →
 *   schedule (via Zernio) → mint share link
 *
 * Continues past per-client failures and prints a summary at the end.
 *
 * Usage:
 *   npx tsx scripts/queue-calendars.ts queue.json
 *   QUEUE_USER_EMAIL=jack@nativz.io QUEUE_DRY_RUN=1 npx tsx scripts/queue-calendars.ts queue.json
 *
 * Config shape (queue.json):
 *   [
 *     {
 *       "clientSlug": "all-shutters-and-blinds",
 *       "driveFolderUrl": "https://drive.google.com/drive/folders/...",
 *       "startDate": "2026-04-28",
 *       "endDate": "2026-05-25",
 *       "platforms": ["instagram", "tiktok"]   // optional; omit = all connected
 *     }
 *   ]
 *
 * Env:
 *   QUEUE_USER_EMAIL  — drive auth + content_drops.created_by (default jack@nativz.io)
 *   QUEUE_DRY_RUN     — '1' to skip the Zernio scheduleDrop call (stop at 'ready')
 *   QUEUE_APP_URL     — base URL for share links (default http://localhost:3001)
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import { listVideosInFolder } from '@/lib/calendar/drive-folder';
import { ingestDrop } from '@/lib/calendar/ingest-drop';
import { analyzeDropVideos } from '@/lib/calendar/analyze-video';
import { generateDropCaptions } from '@/lib/calendar/generate-caption';
import { scheduleDrop } from '@/lib/calendar/schedule-drop';
import type { SocialPlatform } from '@/lib/posting';

interface QueueEntry {
  clientSlug: string;
  driveFolderUrl: string;
  startDate: string;
  endDate: string;
  platforms?: SocialPlatform[];
}

interface RunResult {
  clientSlug: string;
  clientName?: string;
  dropId?: string;
  shareUrl?: string;
  scheduled?: number;
  failed?: number;
  error?: string;
}

const USER_EMAIL = (process.env.QUEUE_USER_EMAIL ?? 'jack@nativz.io').toLowerCase();
const DRY_RUN = process.env.QUEUE_DRY_RUN === '1';
const APP_URL = process.env.QUEUE_APP_URL ?? 'http://localhost:3001';

function step(label: string, indent = '') {
  console.log(`${indent}── ${label} ──`);
}

async function loadConfig(path: string): Promise<QueueEntry[]> {
  const raw = await readFile(resolve(process.cwd(), path), 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('Config must be a JSON array');
  for (const entry of parsed) {
    if (!entry.clientSlug || !entry.driveFolderUrl || !entry.startDate || !entry.endDate) {
      throw new Error(
        `Each entry needs clientSlug, driveFolderUrl, startDate, endDate. Bad entry: ${JSON.stringify(entry)}`,
      );
    }
  }
  return parsed as QueueEntry[];
}

async function runOne(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  userEmail: string,
  entry: QueueEntry,
): Promise<RunResult> {
  const result: RunResult = { clientSlug: entry.clientSlug };

  step(`Resolve client "${entry.clientSlug}"`, '  ');
  const { data: client } = await admin
    .from('clients')
    .select('id, name, caption_cta, caption_hashtags, services, is_active')
    .eq('slug', entry.clientSlug)
    .maybeSingle<{
      id: string;
      name: string;
      caption_cta: string | null;
      caption_hashtags: string[] | null;
      services: string[] | null;
      is_active: boolean | null;
    }>();
  if (!client) {
    result.error = `Client slug not found: ${entry.clientSlug}`;
    return result;
  }
  if (!client.is_active) {
    result.error = 'Client is inactive';
    return result;
  }
  if (!client.services?.includes('SMM')) {
    result.error = 'Client does not have SMM service enabled';
    return result;
  }
  result.clientName = client.name;

  // Validate Zernio prerequisites unless dry-running. No point ingesting
  // 20 videos to fail at the schedule step.
  if (!DRY_RUN) {
    const { data: profiles } = await admin
      .from('social_profiles')
      .select('platform, late_account_id, is_active')
      .eq('client_id', client.id)
      .eq('is_active', true);
    const connected = (profiles ?? []).filter(
      (p) => typeof p.late_account_id === 'string' && p.late_account_id.length > 0,
    );
    if (connected.length === 0) {
      result.error = 'No connected Zernio profiles';
      return result;
    }
    if (entry.platforms?.length) {
      const have = new Set(connected.map((p) => p.platform));
      const missing = entry.platforms.filter((p) => !have.has(p));
      if (missing.length) {
        result.error = `Requested platforms not connected to Zernio: ${missing.join(', ')}`;
        return result;
      }
    }
  }

  // Soft warning — boilerplate is optional but Jack flagged it as the
  // shape he wants every brand to have before bulk-running.
  if (!client.caption_cta?.trim()) {
    console.warn(`  ⚠ ${client.name}: no caption_cta set — captions will ship without a CTA boilerplate`);
  }
  if (!client.caption_hashtags?.length) {
    console.warn(`  ⚠ ${client.name}: no caption_hashtags set — captions will ship without boilerplate tags`);
  }

  step('List Drive videos', '  ');
  const { folderId, videos } = await listVideosInFolder(userId, entry.driveFolderUrl);
  const valid = videos.filter((v) => v.size > 0);
  if (valid.length === 0) {
    result.error = 'Drive folder has no usable videos';
    return result;
  }
  const picked = [...valid].sort((a, b) => a.name.localeCompare(b.name));
  console.log(`    folder ${folderId} → ${picked.length} videos`);

  step('Insert content_drops + videos', '  ');
  const { data: drop, error: dropErr } = await admin
    .from('content_drops')
    .insert({
      client_id: client.id,
      created_by: userId,
      drive_folder_url: entry.driveFolderUrl,
      drive_folder_id: folderId,
      start_date: entry.startDate,
      end_date: entry.endDate,
      // Legacy column — distributeSlots ignores it now, every slot is 12pm Central.
      default_post_time: '12:00',
      total_videos: picked.length,
      status: 'ingesting',
    })
    .select('id')
    .single<{ id: string }>();
  if (dropErr || !drop) {
    result.error = `content_drops insert: ${dropErr?.message ?? 'unknown'}`;
    return result;
  }
  result.dropId = drop.id;

  const videoRows = picked.map((v, idx) => ({
    drop_id: drop.id,
    drive_file_id: v.id,
    drive_file_name: v.name,
    mime_type: v.mimeType,
    size_bytes: v.size,
    order_index: idx,
    status: 'pending',
  }));
  const { error: vidErr } = await admin.from('content_drop_videos').insert(videoRows);
  if (vidErr) {
    result.error = `content_drop_videos insert: ${vidErr.message}`;
    return result;
  }

  step('Ingest', '  ');
  const ingest = await ingestDrop(admin, { dropId: drop.id, userId });
  console.log(`    processed=${ingest.processed} failed=${ingest.failed}`);
  if (ingest.processed === 0) {
    await admin.from('content_drops').update({ status: 'failed', error_detail: 'all ingests failed' }).eq('id', drop.id);
    result.error = 'All ingests failed';
    return result;
  }
  await admin
    .from('content_drops')
    .update({
      status: 'analyzing',
      processed_videos: ingest.processed,
      error_detail: ingest.failed > 0 ? `${ingest.failed} ingest failures` : null,
    })
    .eq('id', drop.id);

  step('Analyze', '  ');
  const analysis = await analyzeDropVideos(admin, { dropId: drop.id, userId });
  console.log(`    analyzed=${analysis.analyzed} failed=${analysis.failed}`);
  if (analysis.analyzed === 0) {
    await admin.from('content_drops').update({ status: 'failed', error_detail: 'all analyses failed' }).eq('id', drop.id);
    result.error = 'All analyses failed';
    return result;
  }
  await admin
    .from('content_drops')
    .update({
      status: 'generating',
      error_detail: analysis.failed > 0 ? `${analysis.failed} analysis failures` : null,
    })
    .eq('id', drop.id);

  step('Generate captions', '  ');
  const captions = await generateDropCaptions(admin, {
    dropId: drop.id,
    clientId: client.id,
    userId,
    userEmail,
  });
  console.log(`    generated=${captions.generated} failed=${captions.failed}`);
  if (captions.generated === 0) {
    await admin.from('content_drops').update({ status: 'failed', error_detail: 'all captions failed' }).eq('id', drop.id);
    result.error = 'All caption generations failed';
    return result;
  }
  await admin
    .from('content_drops')
    .update({
      status: 'ready',
      error_detail: captions.failed > 0 ? `${captions.failed} caption failures` : null,
    })
    .eq('id', drop.id);

  if (DRY_RUN) {
    console.log('    (dry-run) skipping schedule step');
    result.scheduled = 0;
    result.failed = 0;
    return result;
  }

  step('Schedule via Zernio', '  ');
  const sched = await scheduleDrop(admin, {
    dropId: drop.id,
    platforms: entry.platforms,
  });
  console.log(`    scheduled=${sched.scheduled} failed=${sched.failed}`);
  result.scheduled = sched.scheduled;
  result.failed = sched.failed;

  if (sched.scheduled > 0) {
    step('Mint share link', '  ');
    const { data: scheduledVideos } = await admin
      .from('content_drop_videos')
      .select('scheduled_post_id')
      .eq('drop_id', drop.id)
      .not('scheduled_post_id', 'is', null);
    const postIds = (scheduledVideos ?? [])
      .map((v) => v.scheduled_post_id as string | null)
      .filter((p): p is string => typeof p === 'string');

    if (postIds.length > 0) {
      const { data: reviewLinks } = await admin
        .from('post_review_links')
        .insert(postIds.map((postId) => ({ post_id: postId })))
        .select('id, post_id');
      const reviewMap: Record<string, string> = {};
      for (const rl of reviewLinks ?? []) reviewMap[rl.post_id as string] = rl.id as string;

      const { data: shareLink } = await admin
        .from('content_drop_share_links')
        .insert({
          drop_id: drop.id,
          included_post_ids: postIds,
          post_review_link_map: reviewMap,
        })
        .select('token')
        .single<{ token: string }>();
      if (shareLink) {
        result.shareUrl = `${APP_URL}/c/${shareLink.token}`;
      }
    }
  }

  return result;
}

async function main() {
  const configPath = process.argv[2];
  if (!configPath) {
    console.error('Usage: npx tsx scripts/queue-calendars.ts <config.json>');
    process.exit(1);
  }

  const entries = await loadConfig(configPath);
  console.log(`Loaded ${entries.length} entries from ${configPath}`);
  if (DRY_RUN) console.log('DRY-RUN: scheduleDrop will be skipped');

  const admin = createAdminClient();

  const { data: userRow, error: userErr } = await admin
    .from('users')
    .select('id, email')
    .ilike('email', USER_EMAIL)
    .single<{ id: string; email: string }>();
  if (userErr || !userRow) throw new Error(`User not found: ${USER_EMAIL}`);
  console.log(`Running as ${userRow.email} (${userRow.id})`);

  const results: RunResult[] = [];
  for (const entry of entries) {
    console.log(`\n══════════════════════════════════════════`);
    console.log(`▶ ${entry.clientSlug}  ${entry.startDate} → ${entry.endDate}`);
    console.log(`══════════════════════════════════════════`);
    try {
      const result = await runOne(admin, userRow.id, userRow.email, entry);
      results.push(result);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown';
      console.error(`  ✗ crashed: ${reason}`);
      results.push({ clientSlug: entry.clientSlug, error: reason });
    }
  }

  console.log('\n══════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('══════════════════════════════════════════');
  for (const r of results) {
    const tag = r.error ? '✗' : r.shareUrl ? '✓' : r.dropId ? '◐' : '✗';
    const name = r.clientName ?? r.clientSlug;
    if (r.error) {
      console.log(`${tag} ${name}: ${r.error}`);
    } else {
      const counts = r.scheduled !== undefined ? ` (scheduled=${r.scheduled} failed=${r.failed})` : '';
      console.log(`${tag} ${name}${counts}`);
      if (r.shareUrl) console.log(`    ${r.shareUrl}`);
      else if (r.dropId) console.log(`    drop ${r.dropId} (no share link)`);
    }
  }

  const failures = results.filter((r) => r.error).length;
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('\n✗ queue crashed:', err);
  process.exit(1);
});
