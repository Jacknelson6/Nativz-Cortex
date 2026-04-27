import { listFiles, downloadFile, extractFolderId } from '@/lib/google/drive';

export interface DriveVideoFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
}

const MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;

export async function listVideosInFolder(
  userId: string,
  folderUrl: string,
): Promise<{ folderId: string; videos: DriveVideoFile[] }> {
  const folderId = extractFolderId(folderUrl);
  if (!folderId) throw new Error('Could not extract folder ID from URL');

  const all: DriveVideoFile[] = [];
  let pageToken: string | undefined;
  let totalBytes = 0;

  do {
    const page = await listFiles(userId, { folderId, pageSize: 100, pageToken });
    for (const f of page.files) {
      if (!f.mimeType?.startsWith('video/')) continue;
      const size = Number(f.size ?? 0);
      totalBytes += size;
      if (totalBytes > MAX_TOTAL_BYTES) {
        throw new Error('Folder exceeds 2 GB total size; please split into smaller folders.');
      }
      all.push({ id: f.id, name: f.name, mimeType: f.mimeType, size });
    }
    pageToken = page.nextPageToken;
  } while (pageToken);

  return { folderId, videos: all };
}

export async function downloadDriveVideo(
  userId: string,
  fileId: string,
): Promise<{ buffer: Buffer; mimeType: string; size: number }> {
  return downloadFile(userId, fileId);
}
