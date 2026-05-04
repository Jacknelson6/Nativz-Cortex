import { listFiles, downloadFile, extractFolderId } from '@/lib/google/drive';

export interface DriveMediaFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
}

export type DriveVideoFile = DriveMediaFile;

const MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;

export type DriveMediaKind = 'video' | 'image';

function matchesKind(mimeType: string | undefined, kind: DriveMediaKind): boolean {
  if (!mimeType) return false;
  if (kind === 'video') return mimeType.startsWith('video/');
  return mimeType.startsWith('image/');
}

export async function listMediaInFolder(
  userId: string,
  folderUrl: string,
  kind: DriveMediaKind,
): Promise<{ folderId: string; files: DriveMediaFile[] }> {
  const folderId = extractFolderId(folderUrl);
  if (!folderId) throw new Error('Could not extract folder ID from URL');

  const all: DriveMediaFile[] = [];
  let pageToken: string | undefined;
  let totalBytes = 0;

  do {
    const page = await listFiles(userId, { folderId, pageSize: 100, pageToken });
    for (const f of page.files) {
      if (!matchesKind(f.mimeType, kind)) continue;
      const size = Number(f.size ?? 0);
      totalBytes += size;
      if (totalBytes > MAX_TOTAL_BYTES) {
        throw new Error('Folder exceeds 2 GB total size; please split into smaller folders.');
      }
      all.push({ id: f.id, name: f.name, mimeType: f.mimeType, size });
    }
    pageToken = page.nextPageToken;
  } while (pageToken);

  // Drive listing order is not stable; sort by name so carousel position
  // (when ingested 1:1 from a folder) feels predictable for editors who
  // numbered their files 01_, 02_, etc.
  all.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
  );

  return { folderId, files: all };
}

export async function listVideosInFolder(
  userId: string,
  folderUrl: string,
): Promise<{ folderId: string; videos: DriveMediaFile[] }> {
  const { folderId, files } = await listMediaInFolder(userId, folderUrl, 'video');
  return { folderId, videos: files };
}

export async function downloadDriveVideo(
  userId: string,
  fileId: string,
): Promise<{ buffer: Buffer; mimeType: string; size: number }> {
  return downloadFile(userId, fileId);
}

// Same API as downloadDriveVideo, kept under a media-agnostic name for
// image call-sites. Drive's download endpoint doesn't care about MIME.
export async function downloadDriveMedia(
  userId: string,
  fileId: string,
): Promise<{ buffer: Buffer; mimeType: string; size: number }> {
  return downloadFile(userId, fileId);
}
