/**
 * Google Drive API client — read-only operations.
 */

import { getValidToken } from './auth';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime: string;
  webViewLink?: string;
  iconLink?: string;
  thumbnailLink?: string;
  parents?: string[];
}

interface DriveListResponse {
  files: DriveFile[];
  nextPageToken?: string;
}

async function driveRequest(userId: string, path: string, params?: Record<string, string>) {
  const token = await getValidToken(userId);
  if (!token) throw new Error('Google account not connected');

  const url = new URL(`${DRIVE_API}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Drive API error: ${err.error?.message || res.statusText}`);
  }

  return res.json();
}

/**
 * List files in a folder (or root if no folderId).
 */
export async function listFiles(
  userId: string,
  opts: {
    folderId?: string;
    query?: string;
    pageSize?: number;
    pageToken?: string;
  } = {},
): Promise<DriveListResponse> {
  const parts: string[] = ['trashed = false'];
  if (opts.folderId) {
    parts.push(`'${opts.folderId}' in parents`);
  }
  if (opts.query) {
    parts.push(`fullText contains '${opts.query.replace(/'/g, "\\'")}'`);
  }

  return driveRequest(userId, '/files', {
    q: parts.join(' and '),
    fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, webViewLink, iconLink, thumbnailLink, parents)',
    pageSize: String(opts.pageSize ?? 50),
    orderBy: 'modifiedTime desc',
    ...(opts.pageToken ? { pageToken: opts.pageToken } : {}),
  });
}

/**
 * Get metadata for a single file.
 */
export async function getFile(userId: string, fileId: string): Promise<DriveFile> {
  return driveRequest(userId, `/files/${fileId}`, {
    fields: 'id, name, mimeType, size, modifiedTime, webViewLink, iconLink, thumbnailLink, parents',
  });
}

/**
 * Download a binary Drive file with the authenticated user's read-only token.
 * Google Docs/Sheets/Slides are intentionally unsupported here; the ad
 * reference sync only accepts actual image files.
 */
export async function downloadFile(
  userId: string,
  fileId: string,
): Promise<{ buffer: Buffer; mimeType: string; size: number }> {
  const token = await getValidToken(userId);
  if (!token) throw new Error('Google account not connected');

  const res = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Drive download failed: ${res.status} ${err.slice(0, 200)}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const mimeType = res.headers.get('content-type') ?? 'application/octet-stream';
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType,
    size: arrayBuffer.byteLength,
  };
}

/**
 * Extract a folder ID from a Google Drive URL.
 * Supports: /folders/ID, /file/d/ID, open?id=ID
 */
export function extractFolderId(url: string): string | null {
  try {
    const u = new URL(url);
    // https://drive.google.com/drive/folders/FOLDER_ID
    const folderMatch = u.pathname.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (folderMatch) return folderMatch[1];

    // https://drive.google.com/file/d/FILE_ID
    const fileMatch = u.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (fileMatch) return fileMatch[1];

    // https://drive.google.com/open?id=ID
    const idParam = u.searchParams.get('id');
    if (idParam) return idParam;

    return null;
  } catch {
    return null;
  }
}

/**
 * List files from a Drive URL (convenience wrapper).
 */
export async function listFilesFromUrl(
  userId: string,
  driveUrl: string,
  opts?: { pageSize?: number; pageToken?: string },
): Promise<DriveListResponse> {
  const folderId = extractFolderId(driveUrl);
  if (!folderId) throw new Error('Could not extract folder ID from URL');
  return listFiles(userId, { folderId, ...opts });
}
