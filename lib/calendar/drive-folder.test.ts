import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/google/drive', () => ({
  listFiles: vi.fn(),
  downloadFile: vi.fn(),
  extractFolderId: vi.fn(),
}));

import { listVideosInFolder, downloadDriveVideo } from './drive-folder';
import { listFiles, downloadFile, extractFolderId } from '@/lib/google/drive';

const mockListFiles = vi.mocked(listFiles);
const mockDownloadFile = vi.mocked(downloadFile);
const mockExtractFolderId = vi.mocked(extractFolderId);

interface DriveFile {
  id: string;
  name: string;
  mimeType?: string | null;
  size?: string | number | null;
}

function page(files: DriveFile[], nextPageToken?: string) {
  return { files, nextPageToken } as Awaited<ReturnType<typeof listFiles>>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listVideosInFolder', () => {
  it('throws when extractFolderId returns null', async () => {
    mockExtractFolderId.mockReturnValueOnce(null);
    await expect(
      listVideosInFolder('user-1', 'https://drive.google.com/oops'),
    ).rejects.toThrow('Could not extract folder ID from URL');
    expect(mockListFiles).not.toHaveBeenCalled();
  });

  it('returns folderId + videos on a clean single-page response', async () => {
    mockExtractFolderId.mockReturnValueOnce('folder-abc');
    mockListFiles.mockResolvedValueOnce(
      page([
        { id: 'v1', name: 'one.mp4', mimeType: 'video/mp4', size: '1024' },
        { id: 'v2', name: 'two.mov', mimeType: 'video/quicktime', size: '2048' },
      ]),
    );

    const result = await listVideosInFolder('user-1', 'https://drive/folder-abc');
    expect(result.folderId).toBe('folder-abc');
    expect(result.videos).toEqual([
      { id: 'v1', name: 'one.mp4', mimeType: 'video/mp4', size: 1024 },
      { id: 'v2', name: 'two.mov', mimeType: 'video/quicktime', size: 2048 },
    ]);
  });

  it('filters out non-video files', async () => {
    mockExtractFolderId.mockReturnValueOnce('folder-abc');
    mockListFiles.mockResolvedValueOnce(
      page([
        { id: 'a', name: 'a.mp4', mimeType: 'video/mp4', size: '100' },
        { id: 'b', name: 'b.pdf', mimeType: 'application/pdf', size: '200' },
        { id: 'c', name: 'c.png', mimeType: 'image/png', size: '300' },
        { id: 'd', name: 'd.mov', mimeType: 'video/quicktime', size: '400' },
      ]),
    );

    const { videos } = await listVideosInFolder('user-1', 'url');
    expect(videos.map((v) => v.id)).toEqual(['a', 'd']);
  });

  it('skips files with null/undefined mimeType (no startsWith crash)', async () => {
    mockExtractFolderId.mockReturnValueOnce('folder-abc');
    mockListFiles.mockResolvedValueOnce(
      page([
        { id: 'no-mime', name: 'mystery.bin', mimeType: null, size: '500' },
        { id: 'undef-mime', name: 'mystery2.bin', size: '500' },
        { id: 'yes', name: 'real.mp4', mimeType: 'video/mp4', size: '500' },
      ]),
    );

    const { videos } = await listVideosInFolder('user-1', 'url');
    expect(videos.map((v) => v.id)).toEqual(['yes']);
  });

  it('aggregates videos across multiple pages', async () => {
    mockExtractFolderId.mockReturnValueOnce('folder-abc');
    mockListFiles
      .mockResolvedValueOnce(
        page(
          [
            { id: 'v1', name: 'one.mp4', mimeType: 'video/mp4', size: '100' },
            { id: 'v2', name: 'two.mp4', mimeType: 'video/mp4', size: '200' },
          ],
          'next-token-1',
        ),
      )
      .mockResolvedValueOnce(
        page([
          { id: 'v3', name: 'three.mp4', mimeType: 'video/mp4', size: '300' },
        ]),
      );

    const { videos } = await listVideosInFolder('user-1', 'url');
    expect(videos.map((v) => v.id)).toEqual(['v1', 'v2', 'v3']);
    expect(mockListFiles).toHaveBeenCalledTimes(2);
    // Second call must propagate the page token from the first response.
    const secondCall = mockListFiles.mock.calls[1]![1] as {
      pageToken?: string;
    };
    expect(secondCall.pageToken).toBe('next-token-1');
  });

  it('forwards folderId and pageSize=100 to listFiles on the first call', async () => {
    mockExtractFolderId.mockReturnValueOnce('folder-xyz');
    mockListFiles.mockResolvedValueOnce(page([]));

    await listVideosInFolder('user-1', 'url');
    expect(mockListFiles).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ folderId: 'folder-xyz', pageSize: 100 }),
    );
  });

  it('treats missing size as 0 bytes', async () => {
    mockExtractFolderId.mockReturnValueOnce('folder-abc');
    mockListFiles.mockResolvedValueOnce(
      page([
        { id: 'v1', name: 'one.mp4', mimeType: 'video/mp4', size: null },
        { id: 'v2', name: 'two.mp4', mimeType: 'video/mp4' },
      ]),
    );
    const { videos } = await listVideosInFolder('user-1', 'url');
    expect(videos[0]!.size).toBe(0);
    expect(videos[1]!.size).toBe(0);
  });

  it('returns an empty videos array on an empty folder', async () => {
    mockExtractFolderId.mockReturnValueOnce('folder-empty');
    mockListFiles.mockResolvedValueOnce(page([]));

    const { folderId, videos } = await listVideosInFolder('user-1', 'url');
    expect(folderId).toBe('folder-empty');
    expect(videos).toEqual([]);
  });

  it('throws when total size exceeds the 2 GB cap', async () => {
    mockExtractFolderId.mockReturnValueOnce('folder-abc');
    const ONE_GB = 1024 * 1024 * 1024;
    mockListFiles.mockResolvedValueOnce(
      page([
        { id: 'v1', name: 'one.mp4', mimeType: 'video/mp4', size: String(ONE_GB) },
        { id: 'v2', name: 'two.mp4', mimeType: 'video/mp4', size: String(ONE_GB) },
        { id: 'v3', name: 'three.mp4', mimeType: 'video/mp4', size: '1' },
      ]),
    );
    await expect(listVideosInFolder('user-1', 'url')).rejects.toThrow(
      /exceeds 2 GB/,
    );
  });

  it('does NOT throw when total is exactly at the 2 GB boundary', async () => {
    mockExtractFolderId.mockReturnValueOnce('folder-abc');
    const TWO_GB = 2 * 1024 * 1024 * 1024;
    mockListFiles.mockResolvedValueOnce(
      page([
        { id: 'v1', name: 'one.mp4', mimeType: 'video/mp4', size: String(TWO_GB) },
      ]),
    );
    const { videos } = await listVideosInFolder('user-1', 'url');
    expect(videos).toHaveLength(1);
  });

  it('throws mid-page when running totals tip over the cap', async () => {
    mockExtractFolderId.mockReturnValueOnce('folder-abc');
    const ONE_GB = 1024 * 1024 * 1024;
    // First page is fine (1 GB total), second page tips over.
    mockListFiles
      .mockResolvedValueOnce(
        page(
          [
            { id: 'v1', name: 'one.mp4', mimeType: 'video/mp4', size: String(ONE_GB) },
          ],
          'next',
        ),
      )
      .mockResolvedValueOnce(
        page([
          { id: 'v2', name: 'two.mp4', mimeType: 'video/mp4', size: String(ONE_GB) },
          { id: 'v3', name: 'three.mp4', mimeType: 'video/mp4', size: '1' },
        ]),
      );

    await expect(listVideosInFolder('user-1', 'url')).rejects.toThrow(
      /exceeds 2 GB/,
    );
  });
});

describe('downloadDriveVideo', () => {
  it('delegates to downloadFile and passes through its result', async () => {
    const buffer = Buffer.from('fake video bytes');
    mockDownloadFile.mockResolvedValueOnce({
      buffer,
      mimeType: 'video/mp4',
      size: buffer.length,
    });

    const result = await downloadDriveVideo('user-1', 'file-abc');
    expect(mockDownloadFile).toHaveBeenCalledWith('user-1', 'file-abc');
    expect(result).toEqual({ buffer, mimeType: 'video/mp4', size: buffer.length });
  });

  it('propagates errors from downloadFile', async () => {
    mockDownloadFile.mockRejectedValueOnce(new Error('drive 503'));
    await expect(downloadDriveVideo('user-1', 'file-abc')).rejects.toThrow(
      'drive 503',
    );
  });
});
