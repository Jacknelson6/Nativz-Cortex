import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { uploadVideoBytes, uploadThumbnail } from './storage-upload';

interface UploadStub {
  upload: ReturnType<typeof vi.fn>;
  getPublicUrl: ReturnType<typeof vi.fn>;
}

function buildAdmin(buckets: Record<string, UploadStub>): SupabaseClient {
  return {
    storage: {
      from: vi.fn((bucket: string) => {
        const stub = buckets[bucket];
        if (!stub) throw new Error(`unexpected bucket: ${bucket}`);
        return stub;
      }),
    },
  } as unknown as SupabaseClient;
}

function makeBucket(opts: {
  uploadResult?: { error: Error | null } | Error;
  publicUrl?: string;
}): UploadStub {
  return {
    upload: vi.fn(async () => {
      if (opts.uploadResult instanceof Error) throw opts.uploadResult;
      return opts.uploadResult ?? { error: null };
    }),
    getPublicUrl: vi.fn(() => ({
      data: { publicUrl: opts.publicUrl ?? 'https://cdn.example/abc' },
    })),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('uploadVideoBytes', () => {
  it('uploads small buffers via the standard endpoint and returns the public URL', async () => {
    const bucket = makeBucket({
      publicUrl: 'https://cdn.example/drops/d1/v1.mp4',
    });
    const admin = buildAdmin({ 'scheduler-media': bucket });
    const buffer = Buffer.alloc(1024); // well under 40 MB

    const promise = uploadVideoBytes(admin, {
      dropId: 'd1',
      videoId: 'v1',
      buffer,
      mimeType: 'video/mp4',
      ext: 'mp4',
    });
    await vi.runAllTimersAsync();
    const url = await promise;

    expect(url).toBe('https://cdn.example/drops/d1/v1.mp4');
    expect(bucket.upload).toHaveBeenCalledTimes(1);
    expect(bucket.upload).toHaveBeenCalledWith(
      'drops/d1/v1.mp4',
      buffer,
      { contentType: 'video/mp4', upsert: true },
    );
    expect(bucket.getPublicUrl).toHaveBeenCalledWith('drops/d1/v1.mp4');
  });

  it('uses the `scheduler-media` bucket for video uploads', async () => {
    const bucket = makeBucket({});
    const admin = buildAdmin({ 'scheduler-media': bucket });
    const promise = uploadVideoBytes(admin, {
      dropId: 'd1',
      videoId: 'v1',
      buffer: Buffer.alloc(10),
      mimeType: 'video/mp4',
      ext: 'mp4',
    });
    await vi.runAllTimersAsync();
    await promise;
    expect(admin.storage.from).toHaveBeenCalledWith('scheduler-media');
  });

  it('honors the requested file extension in the upload path', async () => {
    const bucket = makeBucket({
      publicUrl: 'https://cdn.example/drops/d2/v9.mov',
    });
    const admin = buildAdmin({ 'scheduler-media': bucket });
    const promise = uploadVideoBytes(admin, {
      dropId: 'd2',
      videoId: 'v9',
      buffer: Buffer.alloc(10),
      mimeType: 'video/quicktime',
      ext: 'mov',
    });
    await vi.runAllTimersAsync();
    const url = await promise;
    expect(bucket.upload).toHaveBeenCalledWith(
      'drops/d2/v9.mov',
      expect.any(Buffer),
      { contentType: 'video/quicktime', upsert: true },
    );
    expect(url).toBe('https://cdn.example/drops/d2/v9.mov');
  });

  it('throws immediately on a non-transient upload error (no retries)', async () => {
    const bucket = makeBucket({
      uploadResult: { error: new Error('Permission denied') },
    });
    const admin = buildAdmin({ 'scheduler-media': bucket });

    const promise = uploadVideoBytes(admin, {
      dropId: 'd1',
      videoId: 'v1',
      buffer: Buffer.alloc(10),
      mimeType: 'video/mp4',
      ext: 'mp4',
    });
    const rejection = expect(promise).rejects.toThrow(/Permission denied/);
    await vi.runAllTimersAsync();
    await rejection;
    expect(bucket.upload).toHaveBeenCalledTimes(1);
  });

  it('retries on a transient 5xx error and eventually succeeds', async () => {
    const bucket = makeBucket({});
    // Override upload to fail twice then succeed.
    bucket.upload = vi
      .fn()
      .mockResolvedValueOnce({ error: new Error('Bad Gateway') })
      .mockResolvedValueOnce({ error: new Error('502') })
      .mockResolvedValueOnce({ error: null });
    const admin = buildAdmin({ 'scheduler-media': bucket });

    const promise = uploadVideoBytes(admin, {
      dropId: 'd1',
      videoId: 'v1',
      buffer: Buffer.alloc(10),
      mimeType: 'video/mp4',
      ext: 'mp4',
    });
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBeDefined();
    expect(bucket.upload).toHaveBeenCalledTimes(3);
  });

  it('gives up after 3 attempts when transient errors keep recurring', async () => {
    const bucket = makeBucket({});
    bucket.upload = vi.fn().mockResolvedValue({
      error: new Error('Service Unavailable'),
    });
    const admin = buildAdmin({ 'scheduler-media': bucket });

    const promise = uploadVideoBytes(admin, {
      dropId: 'd1',
      videoId: 'v1',
      buffer: Buffer.alloc(10),
      mimeType: 'video/mp4',
      ext: 'mp4',
    });
    const rejection = expect(promise).rejects.toThrow(/Service Unavailable/);
    await vi.runAllTimersAsync();
    await rejection;
    expect(bucket.upload).toHaveBeenCalledTimes(3);
  });

  it('treats ECONNRESET / fetch failed messages as transient', async () => {
    const bucket = makeBucket({});
    bucket.upload = vi
      .fn()
      .mockResolvedValueOnce({ error: new Error('ECONNRESET') })
      .mockResolvedValueOnce({ error: new Error('fetch failed') })
      .mockResolvedValueOnce({ error: null });
    const admin = buildAdmin({ 'scheduler-media': bucket });

    const promise = uploadVideoBytes(admin, {
      dropId: 'd1',
      videoId: 'v1',
      buffer: Buffer.alloc(10),
      mimeType: 'video/mp4',
      ext: 'mp4',
    });
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBeDefined();
    expect(bucket.upload).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry on a clearly non-transient 4xx-like error', async () => {
    const bucket = makeBucket({});
    bucket.upload = vi.fn().mockResolvedValue({
      error: new Error('Object exceeded maximum allowed size'),
    });
    const admin = buildAdmin({ 'scheduler-media': bucket });

    const promise = uploadVideoBytes(admin, {
      dropId: 'd1',
      videoId: 'v1',
      buffer: Buffer.alloc(10),
      mimeType: 'video/mp4',
      ext: 'mp4',
    });
    const rejection = expect(promise).rejects.toThrow(/maximum allowed size/);
    await vi.runAllTimersAsync();
    await rejection;
    expect(bucket.upload).toHaveBeenCalledTimes(1);
  });
});

describe('uploadThumbnail', () => {
  it('uploads to the `scheduler-thumbnails` bucket with image/jpeg + .jpg extension', async () => {
    const bucket = makeBucket({
      publicUrl: 'https://cdn.example/drops/d1/v1.jpg',
    });
    const admin = buildAdmin({ 'scheduler-thumbnails': bucket });

    const promise = uploadThumbnail(admin, {
      dropId: 'd1',
      videoId: 'v1',
      buffer: Buffer.alloc(100),
    });
    await vi.runAllTimersAsync();
    const url = await promise;

    expect(url).toBe('https://cdn.example/drops/d1/v1.jpg');
    expect(admin.storage.from).toHaveBeenCalledWith('scheduler-thumbnails');
    expect(bucket.upload).toHaveBeenCalledWith(
      'drops/d1/v1.jpg',
      expect.any(Buffer),
      { contentType: 'image/jpeg', upsert: true },
    );
  });

  it('throws when the upload errors and is non-transient', async () => {
    const bucket = makeBucket({
      uploadResult: { error: new Error('Bucket not found') },
    });
    const admin = buildAdmin({ 'scheduler-thumbnails': bucket });

    const promise = uploadThumbnail(admin, {
      dropId: 'd1',
      videoId: 'v1',
      buffer: Buffer.alloc(100),
    });
    const rejection = expect(promise).rejects.toThrow(/Bucket not found/);
    await vi.runAllTimersAsync();
    await rejection;
    expect(bucket.upload).toHaveBeenCalledTimes(1);
  });

  it('retries on transient errors and recovers', async () => {
    const bucket = makeBucket({});
    bucket.upload = vi
      .fn()
      .mockResolvedValueOnce({ error: new Error('Gateway Timeout') })
      .mockResolvedValueOnce({ error: null });
    const admin = buildAdmin({ 'scheduler-thumbnails': bucket });

    const promise = uploadThumbnail(admin, {
      dropId: 'd1',
      videoId: 'v1',
      buffer: Buffer.alloc(100),
    });
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBeDefined();
    expect(bucket.upload).toHaveBeenCalledTimes(2);
  });
});
