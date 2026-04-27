import Ffmpeg from 'fluent-ffmpeg';
import { writeFile, readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegPath: string | null = require('ffmpeg-static');
if (ffmpegPath) {
  Ffmpeg.setFfmpegPath(ffmpegPath);
}

export async function extractFirstFrame(videoBuffer: Buffer, ext = 'mp4'): Promise<Buffer> {
  const tmpVideo = join(tmpdir(), `cal-vid-${randomUUID()}.${ext}`);
  const tmpFrame = join(tmpdir(), `cal-frame-${randomUUID()}.jpg`);

  await writeFile(tmpVideo, videoBuffer);

  try {
    await new Promise<void>((resolve, reject) => {
      Ffmpeg(tmpVideo)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .screenshots({
          timestamps: ['1'],
          filename: tmpFrame.split('/').pop() ?? 'frame.jpg',
          folder: tmpdir(),
          size: '720x?',
        });
    });
    return await readFile(tmpFrame);
  } finally {
    await unlink(tmpVideo).catch(() => {});
    await unlink(tmpFrame).catch(() => {});
  }
}
