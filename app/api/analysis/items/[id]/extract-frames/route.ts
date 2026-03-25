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

const FRAME_INTERVAL = 3; // seconds between frames

/**
 * Extract frames from a video file every 3 seconds in 9:16 portrait
 */
async function extractFramesFromFile(
  videoPath: string,
  outputDir: string,
  duration: number,
): Promise<{ paths: string[]; timestamps: number[] }> {
  const timestamps: number[] = [];
  for (let t = 0; t < duration; t += FRAME_INTERVAL) {
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

      // Extract a frame every 3 seconds
      const { paths: framePaths, timestamps } = await extractFramesFromFile(videoPath, frameDir, duration);

      if (framePaths.length === 0) {
        return NextResponse.json({ error: 'No frames could be extracted' }, { status: 500 });
      }

      // Upload frames to Supabase Storage
      const frames: VideoFrame[] = [];

      for (let i = 0; i < framePaths.length; i++) {
        const framePath = framePaths[i];
        const frameBuffer = await readFile(framePath);
        const ts = timestamps[i];

        const storagePath = `${id}/${randomUUID()}.jpg`;
        const { error: uploadError } = await adminClient.storage
          .from('moodboard-frames')
          .upload(storagePath, frameBuffer, {
            contentType: 'image/jpeg',
            upsert: false,
          });

        if (uploadError) {
          console.error('Frame upload error:', uploadError);
          continue;
        }

        const { data: publicUrl } = adminClient.storage
          .from('moodboard-frames')
          .getPublicUrl(storagePath);

        const m = Math.floor(ts / 60);
        const s = ts % 60;
        const label = `${m}:${String(s).padStart(2, '0')}`;

        frames.push({
          url: publicUrl.publicUrl,
          timestamp: ts,
          label,
        });
      }

      const visionBreakdown =
        frames.length > 0
          ? await analyzeVisionClipBreakdown({
              frames: frames.map((f) => ({ url: f.url, timestamp: f.timestamp })),
              videoDurationSec: duration,
              userId: user.id,
              userEmail: user.email ?? undefined,
            })
          : null;

      const prevMeta =
        item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
          ? (item.metadata as Record<string, unknown>)
          : {};

      const updatePayload: Record<string, unknown> = {
        frames,
        updated_at: new Date().toISOString(),
      };
      if (visionBreakdown) {
        updatePayload.metadata = { ...prevMeta, vision_clip_breakdown: visionBreakdown };
      }

      await adminClient.from('moodboard_items').update(updatePayload).eq('id', id);

      // Fetch updated item
      const { data: updated } = await adminClient
        .from('moodboard_items')
        .select('*')
        .eq('id', id)
        .single();

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
