/**
 * Direct-upload helper for the calendar branch of the Upload Content
 * modal. Unlike `lib/editing/upload-store.ts` we don't need a long-lived
 * module-scoped store here — the modal mints a drop, runs the uploads
 * sequentially, and routes to the calendar shell when finished. The
 * caller (`editing-new-project-dialog.tsx`) holds the progress state and
 * surfaces it inline in the dialog.
 *
 * Why a thin function instead of replicating the editing dock pattern:
 *   - The editing dock survives dialog dismount; calendar uploads kick
 *     off then immediately navigate to /admin/calendar?dropId=... which
 *     polls the drop row for downstream pipeline progress. The browser
 *     never has to keep a backgrounded upload queue alive.
 *   - The captioning + scheduling work runs server-side after /finalize;
 *     it's much slower than the byte upload itself, so optimizing the
 *     upload-phase UI doesn't move the needle.
 */

export interface CalendarUploadFile {
  index: number;
  file: File;
  video_id: string;
  asset_id?: string;
  storage_path: string;
  public_url: string;
  upload_url: string;
}

export interface CalendarUploadProgress {
  index: number;
  progress: number; // 0-100
  state: 'queued' | 'uploading' | 'done' | 'error';
  error?: string;
}

function putBytes(opts: {
  uploadUrl: string;
  file: File;
  onProgress: (pct: number) => void;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', opts.uploadUrl);
    // Supabase signed upload URLs require Content-Type so the stored
    // object renders with the right MIME, and x-upsert so the PUT
    // succeeds even if the object slot was pre-created. Mirror what
    // lib/editing/upload-store.ts does for images.
    xhr.setRequestHeader('Content-Type', opts.file.type || 'application/octet-stream');
    xhr.setRequestHeader('x-upsert', 'true');
    xhr.upload.addEventListener('progress', (e) => {
      if (!e.lengthComputable) return;
      const pct = Math.min(99, Math.round((e.loaded / e.total) * 100));
      opts.onProgress(pct);
    });
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        opts.onProgress(100);
        resolve();
      } else {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.onabort = () => reject(new Error('Upload aborted'));
    xhr.send(opts.file);
  });
}

export interface FinalizeItem {
  video_id: string;
  asset_id?: string;
  storage_path: string;
  public_url: string;
  size_bytes: number;
  failed?: boolean;
  error_detail?: string;
}

/**
 * Run the byte-PUTs sequentially (matches the editing flow: one moving
 * progress bar at a time, doesn't saturate the user's pipe), collect a
 * finalize manifest, and POST it to /finalize. Returns when finalize has
 * acknowledged — captioning happens fire-and-forget server-side.
 */
export async function runCalendarUploads(opts: {
  dropId: string;
  uploads: CalendarUploadFile[];
  onProgress: (next: CalendarUploadProgress) => void;
}): Promise<void> {
  const finalizeItems: FinalizeItem[] = [];

  for (const u of opts.uploads) {
    opts.onProgress({ index: u.index, progress: 0, state: 'uploading' });
    try {
      await putBytes({
        uploadUrl: u.upload_url,
        file: u.file,
        onProgress: (pct) =>
          opts.onProgress({ index: u.index, progress: pct, state: 'uploading' }),
      });
      finalizeItems.push({
        video_id: u.video_id,
        asset_id: u.asset_id,
        storage_path: u.storage_path,
        public_url: u.public_url,
        size_bytes: u.file.size,
      });
      opts.onProgress({ index: u.index, progress: 100, state: 'done' });
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Upload failed';
      finalizeItems.push({
        video_id: u.video_id,
        asset_id: u.asset_id,
        storage_path: u.storage_path,
        public_url: u.public_url,
        size_bytes: u.file.size,
        failed: true,
        error_detail: detail,
      });
      opts.onProgress({ index: u.index, progress: 0, state: 'error', error: detail });
    }
  }

  // Always call finalize, even if some uploads failed — the server marks
  // failed rows individually so the partial-success case lands as
  // "some posts ready, some failed" rather than the whole drop dying.
  const res = await fetch(`/api/calendar/drops/${opts.dropId}/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: finalizeItems }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Finalize failed (${res.status})`);
  }
}
