import { describe, expect, it } from 'vitest';
import { compressVideoIfOversize } from './compress-video';

/**
 * The actual ffmpeg path is heavy I/O and not worth mocking for unit-test
 * value. These tests cover the no-op cheap path: anything <= 40 MB is
 * returned unchanged, with the right mime/ext shape. The size-threshold
 * guard is the invariant that keeps the upload pipeline cheap, so it has
 * to stay correct.
 */

const FORTY_MB = 40 * 1024 * 1024;

describe('compressVideoIfOversize (no-op path)', () => {
  it('returns the original buffer untouched when under the 40 MB threshold', async () => {
    const buf = Buffer.alloc(1024);
    const result = await compressVideoIfOversize(buf, 'mp4');
    expect(result.buffer).toBe(buf); // same reference, no copy
    expect(result.compressed).toBe(false);
    expect(result.originalSize).toBe(1024);
    expect(result.finalSize).toBe(1024);
  });

  it('preserves the input extension on no-op', async () => {
    const buf = Buffer.alloc(100);
    const result = await compressVideoIfOversize(buf, 'mov');
    expect(result.ext).toBe('mov');
    expect(result.compressed).toBe(false);
  });

  it('maps mp4 extension to video/mp4', async () => {
    const result = await compressVideoIfOversize(Buffer.alloc(10), 'mp4');
    expect(result.mimeType).toBe('video/mp4');
  });

  it('maps mov extension to video/quicktime', async () => {
    const result = await compressVideoIfOversize(Buffer.alloc(10), 'mov');
    expect(result.mimeType).toBe('video/quicktime');
  });

  it('maps webm extension to video/webm', async () => {
    const result = await compressVideoIfOversize(Buffer.alloc(10), 'webm');
    expect(result.mimeType).toBe('video/webm');
  });

  it('falls back to video/mp4 for unknown extensions', async () => {
    const result = await compressVideoIfOversize(Buffer.alloc(10), 'avi');
    expect(result.mimeType).toBe('video/mp4');
  });

  it('handles uppercase extensions case-insensitively', async () => {
    const result = await compressVideoIfOversize(Buffer.alloc(10), 'MOV');
    expect(result.mimeType).toBe('video/quicktime');
  });

  it('handles mixed-case extensions case-insensitively', async () => {
    const result = await compressVideoIfOversize(Buffer.alloc(10), 'WebM');
    expect(result.mimeType).toBe('video/webm');
  });

  it('handles a zero-byte buffer without crashing', async () => {
    const result = await compressVideoIfOversize(Buffer.alloc(0), 'mp4');
    expect(result.compressed).toBe(false);
    expect(result.originalSize).toBe(0);
    expect(result.finalSize).toBe(0);
  });

  it('treats a buffer exactly at the 40 MB boundary as no-op', async () => {
    // The threshold check is `<=`, so a file at exactly 40 MB skips ffmpeg.
    // This pins that semantics so a future tweak from `<=` to `<` would
    // surface here instead of in production load.
    const buf = Buffer.alloc(FORTY_MB);
    const result = await compressVideoIfOversize(buf, 'mp4');
    expect(result.compressed).toBe(false);
    expect(result.buffer).toBe(buf);
    expect(result.originalSize).toBe(FORTY_MB);
  }, 10_000);

  it('reports originalSize equal to finalSize on the no-op path', async () => {
    const buf = Buffer.alloc(2048);
    const result = await compressVideoIfOversize(buf, 'mp4');
    expect(result.originalSize).toBe(result.finalSize);
  });
});
