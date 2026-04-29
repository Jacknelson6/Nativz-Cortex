/**
 * Retry the 8 Avondale May videos that failed at the storage-upload step.
 *
 *   npx tsx scripts/retry-failed-avondale.ts
 *
 * Why this exists:
 *   The ingest run hit Supabase's project-level 50MB upload cap on 7 of 10
 *   videos (66-100MB phone-recorded talking heads), plus one transient Bad
 *   Gateway on a 18MB clip. Rather than ask Jack to bump the dashboard cap,
 *   this script ffmpeg-compresses anything over 45MB before upload, so a
 *   1080p H.264 talking head lands well under the cap with no visible quality
 *   loss for FB Reels.
 *
 * Flow (per failed video):
 *   1. Download from Drive (SA + DWD as Jack)
 *   2. If size > 45MB: ffmpeg re-encode to /tmp at crf 24, cap short-edge 1080
 *   3. Upload (compressed or original) to Supabase storage
 *   4. Generate thumbnail from first frame
 *   5. Flip row to status='analyzing' with new video_url + size
 *
 * Then re-runs analyzeDropVideos + generateDropCaptions for the whole drop
 * so the 8 newly-ingested rows pick up captions, mirroring the ingest script.
 *
 * Idempotent: only touches rows currently in status='failed'. Safe to re-run.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const DROP_ID = 'c6c4ccb7-49d1-4c6b-8786-9e8c7ad0778d';
const CLIENT_ID = 'fb8a1a10-166c-43e7-bd13-981486095cb4';
const JACK_USER_ID = '55dc3ef9-ac65-491a-b74f-d71a150b46e5';
const JACK_EMAIL = 'jack@nativz.io';
const COMPRESS_THRESHOLD_BYTES = 45 * 1024 * 1024;

function runFfmpeg(input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      'ffmpeg',
      [
        '-y',
        '-i', input,
        '-vf', "scale='min(1080,iw)':-2",
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '24',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        output,
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    let stderr = '';
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
    });
    proc.on('error', reject);
  });
}

async function main() {
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const { downloadDriveVideo } = await import('@/lib/calendar/drive-folder');
  const { uploadVideoBytes, uploadThumbnail } = await import('@/lib/calendar/storage-upload');
  const { extractFirstFrame } = await import('@/lib/calendar/thumbnail');
  const { analyzeDropVideos } = await import('@/lib/calendar/analyze-video');
  const { generateDropCaptions } = await import('@/lib/calendar/generate-caption');

  const admin = createAdminClient();

  const { data: failed, error } = await admin
    .from('content_drop_videos')
    .select('id, drive_file_id, drive_file_name, mime_type, size_bytes, order_index')
    .eq('drop_id', DROP_ID)
    .eq('status', 'failed')
    .order('order_index');
  if (error) throw new Error(error.message);
  if (!failed || failed.length === 0) {
    console.log('No failed videos to retry.');
  } else {
    console.log(`→ Retrying ${failed.length} failed videos…\n`);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'avondale-retry-'));
  let processed = 0;
  let stillFailed = 0;

  for (const row of failed ?? []) {
    const sizeMB = row.size_bytes ? (Number(row.size_bytes) / 1024 / 1024).toFixed(1) : '?';
    console.log(`#${String(row.order_index).padStart(2, '0')} ${row.drive_file_name} (${sizeMB}MB)`);
    try {
      console.log('   ↓ downloading from Drive…');
      const dl = await downloadDriveVideo(JACK_USER_ID, row.drive_file_id);
      const ext = (row.drive_file_name.split('.').pop() ?? 'mp4').toLowerCase();

      let uploadBuffer: Buffer = dl.buffer;
      let uploadMime = dl.mimeType;
      let finalSize = dl.size;

      if (dl.size > COMPRESS_THRESHOLD_BYTES) {
        const inPath = path.join(tmpDir, `${row.id}.in.${ext}`);
        const outPath = path.join(tmpDir, `${row.id}.out.mp4`);
        fs.writeFileSync(inPath, dl.buffer);
        console.log(`   ⚙ compressing ${sizeMB}MB > 45MB threshold…`);
        await runFfmpeg(inPath, outPath);
        const stat = fs.statSync(outPath);
        const outMB = (stat.size / 1024 / 1024).toFixed(1);
        console.log(`   ✓ compressed to ${outMB}MB`);
        if (stat.size > 50 * 1024 * 1024) {
          throw new Error(`compressed size ${outMB}MB still > 50MB cap`);
        }
        uploadBuffer = fs.readFileSync(outPath);
        uploadMime = 'video/mp4';
        finalSize = stat.size;
        fs.unlinkSync(inPath);
        fs.unlinkSync(outPath);
      }

      console.log('   ↑ uploading to storage…');
      const videoUrl = await uploadVideoBytes(admin, {
        dropId: DROP_ID,
        videoId: row.id,
        buffer: uploadBuffer,
        mimeType: uploadMime,
        ext: 'mp4',
      });

      let thumbUrl: string | null = null;
      try {
        const frame = await extractFirstFrame(uploadBuffer, 'mp4');
        thumbUrl = await uploadThumbnail(admin, {
          dropId: DROP_ID,
          videoId: row.id,
          buffer: frame,
        });
      } catch (thumbErr) {
        const msg = thumbErr instanceof Error ? thumbErr.message : 'unknown';
        console.log(`   ⚠ thumbnail failed (non-fatal): ${msg}`);
      }

      await admin
        .from('content_drop_videos')
        .update({
          status: 'analyzing',
          video_url: videoUrl,
          thumbnail_url: thumbUrl,
          mime_type: uploadMime,
          size_bytes: finalSize,
          error_detail: null,
        })
        .eq('id', row.id);
      processed += 1;
      console.log('   ✓ ready for analysis\n');
    } catch (err) {
      stillFailed += 1;
      const msg = err instanceof Error ? err.message : 'unknown error';
      console.log(`   ✗ ${msg}\n`);
      await admin
        .from('content_drop_videos')
        .update({ status: 'failed', error_detail: msg })
        .eq('id', row.id);
    }
  }

  // Clean tmp
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}

  console.log(`Re-ingest summary: ${processed} ready / ${stillFailed} still failed\n`);

  if (processed === 0) {
    console.log('Nothing to analyze. Exiting.');
    return;
  }

  // Bump drop counters
  const { count: readyCount } = await admin
    .from('content_drop_videos')
    .select('id', { count: 'exact', head: true })
    .eq('drop_id', DROP_ID)
    .in('status', ['analyzing', 'caption_pending', 'ready']);
  await admin
    .from('content_drops')
    .update({
      status: 'analyzing',
      processed_videos: readyCount ?? processed,
      updated_at: new Date().toISOString(),
      error_detail: null,
    })
    .eq('id', DROP_ID);

  console.log('→ Step 2/3: Gemini E2E video analysis (newly ingested rows)…');
  const analysis = await analyzeDropVideos(admin, { dropId: DROP_ID, userId: JACK_USER_ID });
  console.log(`  Analyzed ${analysis.analyzed} (failed: ${analysis.failed}).`);
  await admin
    .from('content_drops')
    .update({
      status: 'generating',
      updated_at: new Date().toISOString(),
      error_detail: analysis.failed > 0 ? `${analysis.failed} video(s) failed during analysis` : null,
    })
    .eq('id', DROP_ID);

  console.log('\n→ Step 3/3: Caption generation…');
  const captions = await generateDropCaptions(admin, {
    dropId: DROP_ID,
    clientId: CLIENT_ID,
    userId: JACK_USER_ID,
    userEmail: JACK_EMAIL,
  });
  console.log(`  Generated ${captions.generated} (failed: ${captions.failed}).`);

  // Final drop status: count any video still in ready
  const { count: finalReady } = await admin
    .from('content_drop_videos')
    .select('id', { count: 'exact', head: true })
    .eq('drop_id', DROP_ID)
    .eq('status', 'ready');
  await admin
    .from('content_drops')
    .update({
      status: (finalReady ?? 0) > 0 ? 'ready' : 'failed',
      updated_at: new Date().toISOString(),
      error_detail: captions.failed > 0 ? `${captions.failed} caption(s) failed` : null,
    })
    .eq('id', DROP_ID);

  // Print all captions for review
  console.log(`\n=== Captions for drop ${DROP_ID} ===\n`);
  const { data: rows } = await admin
    .from('content_drop_videos')
    .select('order_index, drive_file_name, status, draft_caption, draft_hashtags')
    .eq('drop_id', DROP_ID)
    .order('order_index');
  for (const v of rows ?? []) {
    console.log(`#${String(v.order_index).padStart(2, '0')} [${v.status}] ${v.drive_file_name}`);
    if (v.draft_caption) {
      console.log(`   ${v.draft_caption}`);
      if (v.draft_hashtags?.length) {
        console.log(`   #${(v.draft_hashtags as string[]).join(' #')}`);
      }
    }
    console.log();
  }
  console.log(`Final: ${finalReady ?? 0}/10 ready. Drop status: ${(finalReady ?? 0) > 0 ? 'ready' : 'failed'}`);
  console.log('\nNext:');
  console.log(`  npx tsx scripts/schedule-avondale-may.ts ${DROP_ID} --dry`);
  console.log(`  npx tsx scripts/schedule-avondale-may.ts ${DROP_ID}`);
}

main().catch((err) => {
  console.error('Retry failed:', err);
  process.exit(1);
});
