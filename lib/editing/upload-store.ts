/**
 * Module-scoped upload store for editing project videos.
 *
 * Lives outside React so the uploads keep running after the detail
 * dialog unmounts. Jack closes the dialog while a 10-file batch is
 * uploading? The PUTs keep going against this singleton; when he
 * reopens the dialog, the same in-flight jobs are still there with
 * up-to-date progress because the dialog reads via
 * `useSyncExternalStore`.
 *
 * Keyed by project id so multiple editing projects can be uploading
 * concurrently without state collisions.
 *
 * Also surfaces a global "all uploads finished for project X" event so
 * the editing board can refetch its list to show the new video count
 * without needing the dialog to be open.
 *
 * Transport: Mux direct uploads — server mints a one-shot upload URL
 * (`mux.video.uploads.create()`); browser PUTs the file bytes straight
 * to Mux via XHR (so we get progress events). Mux's webhooks then
 * hydrate `mux_asset_id`/`mux_playback_id` on the row. Bytes never
 * touch our infra, so Vercel's body limits and Supabase's bucket size
 * cap stop being concerns.
 */

export interface UploadJob {
  id: string;
  filename: string;
  size: number;
  progress: number;
  state:
    | 'queued'
    | 'signing'
    | 'uploading'
    | 'finalizing'
    | 'done'
    | 'error';
  detail?: string;
}

export interface ProjectUploadGroup {
  projectId: string;
  jobs: UploadJob[];
}

type Listener = () => void;
type CompletionListener = (projectId: string) => void;

// State is a Map<projectId, UploadJob[]>. We replace the array on every
// mutation so React's `Object.is` check in useSyncExternalStore picks up
// changes, but keep the Map identity stable; callers always read via
// `getProjectUploads(projectId)` which returns the array reference.
const state = new Map<string, UploadJob[]>();
const listeners = new Set<Listener>();
const completionListeners = new Set<CompletionListener>();

// Track in-flight batch counts per project so we can fire the
// completion event exactly once per batch, regardless of how the user
// adds files (one batch, or many small drops while a previous batch is
// still mid-flight).
const activeBatches = new Map<string, number>();

// Cached flat snapshot for getAllUploads(). useSyncExternalStore requires
// getSnapshot to return the SAME reference when nothing has changed, or
// React tears. We rebuild this only when emit() fires.
let allUploadsSnapshot: ProjectUploadGroup[] = [];

function rebuildAllSnapshot() {
  const out: ProjectUploadGroup[] = [];
  for (const [projectId, jobs] of state.entries()) {
    if (jobs.length > 0) out.push({ projectId, jobs });
  }
  allUploadsSnapshot = out;
}

function emit() {
  rebuildAllSnapshot();
  for (const l of listeners) l();
}

function emitCompletion(projectId: string) {
  for (const l of completionListeners) l(projectId);
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function subscribeToCompletion(
  listener: CompletionListener,
): () => void {
  completionListeners.add(listener);
  return () => {
    completionListeners.delete(listener);
  };
}

const EMPTY: UploadJob[] = [];

export function getProjectUploads(projectId: string): UploadJob[] {
  return state.get(projectId) ?? EMPTY;
}

export function clearCompleted(projectId: string): void {
  const cur = state.get(projectId);
  if (!cur) return;
  const next = cur.filter(
    (j) => j.state !== 'done' && j.state !== 'error',
  );
  if (next.length === 0) {
    state.delete(projectId);
  } else {
    state.set(projectId, next);
  }
  emit();
}

function patchJob(
  projectId: string,
  jobId: string,
  patch: Partial<UploadJob>,
): void {
  const cur = state.get(projectId);
  if (!cur) return;
  const next = cur.map((j) => (j.id === jobId ? { ...j, ...patch } : j));
  state.set(projectId, next);
  emit();
}

function appendJobs(projectId: string, jobs: UploadJob[]): void {
  const cur = state.get(projectId) ?? [];
  state.set(projectId, [...cur, ...jobs]);
  emit();
}

/**
 * PUT the file bytes directly to a signed upload URL via XHR so we get
 * upload progress events. Fetch's streams API doesn't expose upload
 * progress in browsers, so XHR is still the right tool here. Used for
 * both Mux direct uploads (videos) and Supabase Storage signed uploads
 * (images); the only difference is whether we set a Content-Type header.
 */
function putBytes(opts: {
  uploadUrl: string;
  file: File;
  contentType?: string;
  onProgress: (pct: number) => void;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', opts.uploadUrl);
    if (opts.contentType) {
      xhr.setRequestHeader('Content-Type', opts.contentType);
      // Supabase Storage signed-upload URLs require x-upsert; without it
      // the endpoint returns 400. Mux direct uploads don't accept extra
      // headers (would break preflight) so we only set this on the image
      // branch, which is also the only path where contentType is set.
      xhr.setRequestHeader('x-upsert', 'true');
    }
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

async function runOne(projectId: string, file: File, jobId: string): Promise<void> {
  try {
    patchJob(projectId, jobId, { state: 'signing' });

    // Step 1: server-side row insert + Mux upload mint.
    const signRes = await fetch(
      `/api/admin/editing/projects/${projectId}/videos`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          mime_type: file.type || 'application/octet-stream',
          size_bytes: file.size,
          position: 0,
        }),
      },
    );
    if (!signRes.ok) {
      const err = (await signRes.json().catch(() => null)) as
        | { detail?: string; error?: string }
        | null;
      throw new Error(err?.detail ?? err?.error ?? 'sign failed');
    }
    const signed = (await signRes.json()) as
      | { kind: 'video'; video_id: string; upload_id: string; upload_url: string }
      | { kind: 'image'; video_id: string; upload_url: string };

    patchJob(projectId, jobId, { state: 'uploading' });

    await putBytes({
      uploadUrl: signed.upload_url,
      file,
      // Supabase Storage signed-upload URLs require Content-Type so the
      // stored object carries the correct MIME for browser rendering;
      // Mux direct-upload URLs don't (Mux infers from bytes), and adding
      // one breaks the preflight allowlist.
      contentType:
        signed.kind === 'image' ? file.type || 'application/octet-stream' : undefined,
      onProgress: (pct) => patchJob(projectId, jobId, { progress: pct }),
    });

    // For videos: the webhook (or share-page reconciler on next read)
    // flips the row 'uploading' -> 'processing' -> 'ready'. We mark the
    // job 'done' once bytes are uploaded; the player UI handles the
    // processing state via `mux_status`.
    // For images: the row was already inserted with `mux_status='ready'`,
    // so once bytes land it's immediately renderable.
    patchJob(projectId, jobId, { state: 'done', progress: 100 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'upload failed';
    patchJob(projectId, jobId, { state: 'error', detail });
  }
}

export function enqueueUploads(projectId: string, files: File[]): string[] {
  if (files.length === 0) return [];
  const jobs: UploadJob[] = files.map((f) => ({
    id: crypto.randomUUID(),
    filename: f.name,
    size: f.size,
    progress: 0,
    state: 'queued',
  }));
  appendJobs(projectId, jobs);

  activeBatches.set(projectId, (activeBatches.get(projectId) ?? 0) + 1);

  void (async () => {
    try {
      // Sequential so the user's pipe isn't saturated and progress bars
      // feel deterministic (one moves at a time).
      for (let i = 0; i < files.length; i += 1) {
        await runOne(projectId, files[i], jobs[i].id);
      }
    } finally {
      const remaining = (activeBatches.get(projectId) ?? 1) - 1;
      if (remaining <= 0) {
        activeBatches.delete(projectId);
        emitCompletion(projectId);
      } else {
        activeBatches.set(projectId, remaining);
      }
    }
  })();

  return jobs.map((j) => j.id);
}

export function hasActiveUploads(projectId: string): boolean {
  const cur = state.get(projectId);
  if (!cur) return false;
  return cur.some(
    (j) =>
      j.state === 'queued' ||
      j.state === 'signing' ||
      j.state === 'uploading' ||
      j.state === 'finalizing',
  );
}

/**
 * Flat snapshot across all projects for the global UploadDock. Returns the
 * cached array; reference is stable until emit() rebuilds it.
 */
export function getAllUploads(): ProjectUploadGroup[] {
  return allUploadsSnapshot;
}

export function clearAllCompleted(): void {
  let mutated = false;
  for (const [projectId, jobs] of Array.from(state.entries())) {
    const next = jobs.filter(
      (j) => j.state !== 'done' && j.state !== 'error',
    );
    if (next.length === jobs.length) continue;
    if (next.length === 0) {
      state.delete(projectId);
    } else {
      state.set(projectId, next);
    }
    mutated = true;
  }
  if (mutated) emit();
}
