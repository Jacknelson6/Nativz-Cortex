import type { SupabaseClient } from '@supabase/supabase-js';
import { getTikTokMetadata } from '@/lib/tiktok/scraper';
import Ffmpeg from 'fluent-ffmpeg';
import { writeFile, readFile, unlink, mkdir, readdir, rmdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import type { VideoFrame } from '@/lib/types/moodboard';
import type { PlatformSource, SearchPlatform } from '@/lib/types/search';
import { analyzeVisionClipBreakdown } from '@/lib/moodboard/vision-clip-breakdown';
import { patchPlatformSourceInSearch } from '@/lib/search/patch-platform-source';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegPath: string | null = require('ffmpeg-static');
if (ffmpegPath) {
  Ffmpeg.setFfmpegPath(ffmpegPath);
}

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

const FRAME_INTERVAL = 3;

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

export type TopicSearchExtractFramesResult =
  | { ok: true; source: PlatformSource }
  | { ok: false; error: string; status?: number };

/**
 * FFmpeg: download TikTok video, extract frames every 3s, upload to moodboard-frames, vision clip breakdown, persist on source.
 */
export async function runTopicSearchSourceExtractFrames(
  admin: SupabaseClient,
  searchId: string,
  platform: SearchPlatform,
  sourceId: string,
  source: PlatformSource,
  user: { id: string; email?: string | null },
): Promise<TopicSearchExtractFramesResult> {
  if (source.platform !== 'tiktok') {
    return {
      ok: false,
      error: 'Frame extraction in research uses TikTok direct video URLs. Try a TikTok source, or open the video in a mood board for full analysis.',
      status: 400,
    };
  }

  const meta = await getTikTokMetadata(source.url);
  const videoUrl = meta?.video_url ?? null;
  if (!videoUrl) {
    return { ok: false, error: 'Could not resolve a direct video URL for this TikTok.', status: 400 };
  }

  const storagePrefix = `topic-search/${searchId}/${platform}-${sourceId}`;

  let videoPath: string | null = null;
  const frameDir = join(tmpdir(), `nativz-frames-${randomUUID()}`);
  await mkdir(frameDir, { recursive: true });

  try {
    videoPath = await downloadVideo(videoUrl);

    const probed = await probeDurationSec(videoPath);
    const duration =
      probed != null && Number.isFinite(probed) && probed > 0
        ? Math.max(1, Math.ceil(probed))
        : meta?.duration && meta.duration > 0
          ? Math.ceil(meta.duration)
          : 30;

    const { paths: framePaths, timestamps } = await extractFramesFromFile(videoPath, frameDir, duration);

    if (framePaths.length === 0) {
      return { ok: false, error: 'No frames could be extracted', status: 500 };
    }

    const frames: VideoFrame[] = [];

    for (let i = 0; i < framePaths.length; i++) {
      const framePath = framePaths[i];
      const frameBuffer = await readFile(framePath);
      const ts = timestamps[i];

      const storagePath = `${storagePrefix}/${randomUUID()}.jpg`;
      const { error: uploadError } = await admin.storage.from('moodboard-frames').upload(storagePath, frameBuffer, {
        contentType: 'image/jpeg',
        upsert: false,
      });

      if (uploadError) {
        console.error('Frame upload error:', uploadError);
        continue;
      }

      const { data: publicUrl } = admin.storage.from('moodboard-frames').getPublicUrl(storagePath);

      const m = Math.floor(ts / 60);
      const s = ts % 60;
      const label = `${m}:${String(s).padStart(2, '0')}`;

      frames.push({
        url: publicUrl.publicUrl,
        timestamp: ts,
        label,
      });
    }

    if (frames.length === 0) {
      return { ok: false, error: 'Frames could not be uploaded to storage.', status: 500 };
    }

    const visionBreakdown = await analyzeVisionClipBreakdown({
      frames: frames.map((f) => ({ url: f.url, timestamp: f.timestamp })),
      videoDurationSec: duration,
      userId: user.id,
      userEmail: user.email ?? undefined,
    });

    const prevMeta =
      source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata)
        ? (source.metadata as Record<string, unknown>)
        : {};

    const patch: Partial<PlatformSource> = {
      frames,
      duration_sec: duration,
      metadata: {
        ...prevMeta,
        vision_clip_breakdown: visionBreakdown,
      },
    };

    const patched = await patchPlatformSourceInSearch(admin, searchId, platform, sourceId, patch);
    if (!patched.ok) {
      return patched;
    }
    return { ok: true, source: patched.updated };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Frame extraction failed';
    return { ok: false, error: msg, status: 500 };
  } finally {
    if (videoPath) {
      try {
        await unlink(videoPath);
      } catch {
        /* ignore */
      }
    }
    try {
      const files = await readdir(frameDir);
      for (const f of files) {
        try {
          await unlink(join(frameDir, f));
        } catch {
          /* ignore */
        }
      }
      await rmdir(frameDir);
    } catch {
      /* ignore */
    }
  }
}
