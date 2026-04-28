import Ffmpeg from 'fluent-ffmpeg';
import { writeFile, readFile, unlink, stat } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegPath: string | null = require('ffmpeg-static');
if (ffmpegPath) Ffmpeg.setFfmpegPath(ffmpegPath);

// Supabase project upload cap is the hard limit. Stay well under it so
// the resulting file uploads via single-PUT without pushing into TUS.
const COMPRESSION_THRESHOLD = 40 * 1024 * 1024;

export interface CompressionResult {
  buffer: Buffer;
  ext: string;
  mimeType: string;
  compressed: boolean;
  originalSize: number;
  finalSize: number;
}

/**
 * Re-encode a video to a smaller H.264/AAC mp4 if it exceeds the upload
 * threshold. 1080p, CRF 26, AAC 128k — visually identical for short-form,
 * lands well under 40MB even for 90-second clips. No-op for already-small
 * files so the cheap path stays cheap.
 */
export async function compressVideoIfOversize(
  buffer: Buffer,
  ext: string,
): Promise<CompressionResult> {
  const originalSize = buffer.byteLength;
  if (originalSize <= COMPRESSION_THRESHOLD) {
    return {
      buffer,
      ext,
      mimeType: mimeForExt(ext),
      compressed: false,
      originalSize,
      finalSize: originalSize,
    };
  }

  const tmpIn = join(tmpdir(), `cal-vid-in-${randomUUID()}.${ext}`);
  const tmpOut = join(tmpdir(), `cal-vid-out-${randomUUID()}.mp4`);
  await writeFile(tmpIn, buffer);
  try {
    await new Promise<void>((resolve, reject) => {
      Ffmpeg(tmpIn)
        .videoCodec('libx264')
        .outputOptions([
          '-crf 26',
          '-preset fast',
          '-pix_fmt yuv420p',
          '-vf scale=-2:min(1080\\,ih)',
          '-movflags +faststart',
        ])
        .audioCodec('aac')
        .audioBitrate('128k')
        .audioChannels(2)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .save(tmpOut);
    });
    const compressed = await readFile(tmpOut);
    const sz = await stat(tmpOut);
    return {
      buffer: compressed,
      ext: 'mp4',
      mimeType: 'video/mp4',
      compressed: true,
      originalSize,
      finalSize: sz.size,
    };
  } finally {
    await unlink(tmpIn).catch(() => {});
    await unlink(tmpOut).catch(() => {});
  }
}

function mimeForExt(ext: string): string {
  const e = ext.toLowerCase();
  if (e === 'mov') return 'video/quicktime';
  if (e === 'webm') return 'video/webm';
  return 'video/mp4';
}
