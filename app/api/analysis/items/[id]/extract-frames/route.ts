import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTikTokMetadata } from '@/lib/tiktok/scraper';
import { getInstagramVideoUrl } from '@/lib/instagram/scraper';
import Ffmpeg from 'fluent-ffmpeg';
import { writeFile, readFile, unlink, mkdir, readdir, rmdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import type { VideoFrame } from '@/lib/types/moodboard';
import { analyzeVisionClipBreakdown } from '@/lib/moodboard/vision-clip-breakdown';

export const maxDuration = 120;

// ffmpeg-static uses module.exports (CJS), so we need require() for the path
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegPath: string | null = require('ffmpeg-static');
if (ffmpegPath) {
  Ffmpeg.setFfmpegPath(ffmpegPath);
}

/**
 * Download a video from URL to a temp file
 */
function probeDurationSec(videoPath: string): Promise<number | null> {
  return new Promise((resolve) => {
    Ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err || metadata?.format?.duration == null) {
        resolve(null);
        return;
      }
      resolve(Number(metadata.format.duration));
    });
  });
}

async function downloadVideo(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Failed to download video: ${res.status}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  const tempPath = join(tmpdir(), `nativz-frame-${randomUUID()}.mp4`);
  await writeFile(tempPath, buffer);
  return tempPath;
}

const DEFAULT_FRAME_INTERVAL = 3; // seconds between frames for short videos
const MAX_FRAMES = 30; // cap total frames so 3-min+ TikToks don't blow past the 120s Vercel ceiling

/**
 * Choose a frame interval that keeps the total count ≤ MAX_FRAMES.
 * Short videos stay at the 3s baseline; longer ones stretch to 5s/6s/etc.
 */
function chooseFrameInterval(durationSec: number): number {
  const base = DEFAULT_FRAME_INTERVAL;
  const needed = Math.ceil(durationSec / base);
  if (needed <= MAX_FRAMES) return base;
  return Math.max(base, Math.ceil(durationSec / MAX_FRAMES));
}

/**
 * Extract frames from a video file at a dynamic interval in 9:16 portrait.
 * Interval scales with duration so Jack's 3-minute TikToks don't try to
 * extract 60 frames and hit the serverless timeout.
 */
async function extractFramesFromFile(
  videoPath: string,
  outputDir: string,
  duration: number,
): Promise<{ paths: string[]; timestamps: number[] }> {
  const interval = chooseFrameInterval(duration);
  const timestamps: number[] = [];
  for (let t = 0; t < duration && timestamps.length < MAX_FRAMES; t += interval) {
    timestamps.push(t);
  }

  if (timestamps.length === 0) {
    throw new Error('No timestamps to extract');
  }

  const extractFrame = (ts: number, index: number): Promise<string> => {
    return new Promise((res, rej) => {
      const outputPath = join(outputDir, `frame-${index}.jpg`);
      // Scale to 360x640 (9:16 portrait), crop to fit if source is different ratio
      Ffmpeg(videoPath)
        .seekInput(ts)
        .frames(1)
        .outputOptions(['-q:v', '2', '-vf', 'scale=360:640:force_original_aspect_ratio=increase,crop=360:640'])
        .output(outputPath)
        .on('end', () => res(outputPath))
        .on('error', (err) => rej(err))
        .run();
    });
  };

  const paths: string[] = [];
  const validTimestamps: number[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    try {
      const path = await extractFrame(timestamps[i], i);
      paths.push(path);
      validTimestamps.push(timestamps[i]);
    } catch (err) {
      console.error(`Failed to extract frame at ${timestamps[i]}s:`, err);
    }
  }
  return { paths, timestamps: validTimestamps };
}

/**
 * Get a direct video URL for the item
 */
async function getVideoUrl(item: { url: string; platform: string | null; metadata?: Record<string, unknown> | null }): Promise<string | null> {
  const platform = item.platform;

  if (platform === 'tiktok') {
    const meta = await getTikTokMetadata(item.url);
    return meta?.video_url ?? null;
  }

  if (platform === 'instagram') {
    return getInstagramVideoUrl(item.url);
  }

  // For other platforms, we don't have a reliable way to get direct video URLs
  return null;
}

/**
 * POST /api/analysis/items/[id]/extract-frames
 *
 * Download a TikTok video and extract frames every 3 seconds using ffmpeg,
 * scaled to 360x640 (9:16 portrait). Uploads frames to the moodboard-frames
 * storage bucket and saves VideoFrame[] to the item record.
 *
 * @auth Required (any authenticated user)
 * @param id - Moodboard item UUID (must be type 'video' and platform 'tiktok')
 * @returns {MoodboardItem} Updated item record with frames array
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { data: item, error: fetchError } = await adminClient
      .from('moodboard_items')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    if (item.type !== 'video') {
      return NextResponse.json({ error: 'Only video items support frame extraction' }, { status: 400 });
    }

    // Get direct video URL
    const videoUrl = await getVideoUrl(item);
    if (!videoUrl) {
      return NextResponse.json(
        { error: `Frame extraction not available for ${item.platform || 'this platform'} yet` },
        { status: 400 }
      );
    }

    // Download video to temp file
    const videoPath = await downloadVideo(videoUrl);

    // Create temp directory for frames
    const frameDir = join(tmpdir(), `nativz-frames-${randomUUID()}`);
    await mkdir(frameDir, { recursive: true });

    try {
      const probed = await probeDurationSec(videoPath);
      const duration =
        probed != null && Number.isFinite(probed) && probed > 0
          ? Math.max(1, Math.ceil(probed))
          : item.duration || 30;

      // Extract a frame at a dynamic interval (capped at MAX_FRAMES)
      const { paths: framePaths, timestamps } = await extractFramesFromFile(videoPath, frameDir, duration);
      console.log(
        `[extract-frames] ${id} · duration=${duration}s · extracted=${framePaths.length}`,
      );

      if (framePaths.length === 0) {
        return NextResponse.json({ error: 'No frames could be extracted' }, { status: 500 });
      }

      // Parallelize uploads — sequential reads + uploads on a 3-minute video
      // blew past Vercel's 120s ceiling. Bounded parallelism keeps memory OK
      // while cutting total time from O(n) to ~O(n/UPLOAD_CONCURRENCY).
      const UPLOAD_CONCURRENCY = 6;
      const frames: VideoFrame[] = new Array(framePaths.length);
      let cursor = 0;
      const workers = Array.from({ length: Math.min(UPLOAD_CONCURRENCY, framePaths.length) }, async () => {
        while (true) {
          const i = cursor++;
          if (i >= framePaths.length) return;
          try {
            const frameBuffer = await readFile(framePaths[i]);
            const ts = timestamps[i];
            const storagePath = `${id}/${randomUUID()}.jpg`;
            const { error: uploadError } = await adminClient.storage
              .from('moodboard-frames')
              .upload(storagePath, frameBuffer, {
                contentType: 'image/jpeg',
                upsert: false,
              });
            if (uploadError) {
              console.error(`[extract-frames] upload failed at ${ts}s:`, uploadError);
              return;
            }
            const { data: publicUrl } = adminClient.storage
              .from('moodboard-frames')
              .getPublicUrl(storagePath);
            const m = Math.floor(ts / 60);
            const s = ts % 60;
            frames[i] = {
              url: publicUrl.publicUrl,
              timestamp: ts,
              label: `${m}:${String(s).padStart(2, '0')}`,
            };
          } catch (err) {
            console.error(`[extract-frames] frame ${i} failed:`, err);
          }
        }
      });
      await Promise.all(workers);
      const uploadedFrames = frames.filter(Boolean);

      if (uploadedFrames.length === 0) {
        return NextResponse.json({ error: 'No frames could be uploaded' }, { status: 500 });
      }

      // Persist frames immediately so the UI can render them — vision
      // breakdown runs after the response (fire-and-forget) since a 14-frame
      // Gemini call adds 20-60s we don't want to block on.
      await adminClient
        .from('moodboard_items')
        .update({ frames: uploadedFrames, updated_at: new Date().toISOString() })
        .eq('id', id);

      const { data: updated } = await adminClient
        .from('moodboard_items')
        .select('*')
        .eq('id', id)
        .single();

      // Kick off vision breakdown in the background; persist when it
      // finishes. Non-fatal — the frames are already saved.
      void (async () => {
        try {
          const visionBreakdown = await analyzeVisionClipBreakdown({
            frames: uploadedFrames.map((f) => ({ url: f.url, timestamp: f.timestamp })),
            videoDurationSec: duration,
            userId: user.id,
            userEmail: user.email ?? undefined,
          });
          if (!visionBreakdown) return;
          const prevMeta =
            item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
              ? (item.metadata as Record<string, unknown>)
              : {};
          await adminClient
            .from('moodboard_items')
            .update({
              metadata: { ...prevMeta, vision_clip_breakdown: visionBreakdown },
              updated_at: new Date().toISOString(),
            })
            .eq('id', id);
        } catch (err) {
          console.error('[extract-frames] vision breakdown failed:', err);
        }
      })();

      return NextResponse.json(updated);
    } finally {
      // Cleanup temp files
      try { await unlink(videoPath); } catch { /* ignore */ }
      try {
        const files = await readdir(frameDir);
        for (const f of files) {
          try { await unlink(join(frameDir, f)); } catch { /* ignore */ }
        }
        await rmdir(frameDir);
      } catch { /* ignore */ }
    }
  } catch (error) {
    console.error('POST /api/analysis/items/[id]/extract-frames error:', error);
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
