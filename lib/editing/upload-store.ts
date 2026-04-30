/**
 * Module-scoped upload store for editing project videos.
 *
 * Lives outside React so the XHR PUTs keep running after the detail
 * dialog unmounts. Jack closes the dialog while a 10-file batch is
 * uploading? The XHRs keep going against this singleton; when he
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

function emit() {
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

/** Empty array singleton so unused project ids return a stable
 *  reference (avoids re-render storms in useSyncExternalStore). */
const EMPTY: UploadJob[] = [];

export function getProjectUploads(projectId: string): UploadJob[] {
  return state.get(projectId) ?? EMPTY;
}

/** Drop completed/error rows for one project. The dialog's "Clear"
 *  affordance + the post-batch cleanup both call this. */
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
 * Real XHR PUT to the Supabase signed-upload URL. Bypasses the SDK
 * helper because that one was hanging silently on transient failures
 * and didn't expose progress events.
 */
function uploadWithProgress(opts: {
  signedUrl: string;
  file: File;
  onProgress: (pct: number) => void;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', opts.signedUrl, true);
    xhr.setRequestHeader(
      'Content-Type',
      opts.file.type || 'application/octet-stream',
    );
    xhr.setRequestHeader('x-upsert', 'true');

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const pct = Math.min(99, Math.floor((e.loaded / e.total) * 100));
      opts.onProgress(pct);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        opts.onProgress(100);
        resolve();
      } else {
        reject(
          new Error(
            `upload http ${xhr.status}: ${xhr.responseText?.slice(0, 200) || xhr.statusText}`,
          ),
        );
      }
    };
    xhr.onerror = () => reject(new Error('network error during upload'));
    xhr.onabort = () => reject(new Error('upload aborted'));
    xhr.ontimeout = () => reject(new Error('upload timed out'));

    xhr.send(opts.file);
  });
}

async function runOne(projectId: string, file: File, jobId: string): Promise<void> {
  try {
    patchJob(projectId, jobId, { state: 'signing' });
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
    const signed = (await signRes.json()) as {
      storage_path: string;
      upload_token: string;
      signed_url: string;
    };

    patchJob(projectId, jobId, { state: 'uploading' });

    await uploadWithProgress({
      signedUrl: signed.signed_url,
      file,
      onProgress: (pct) => patchJob(projectId, jobId, { progress: pct }),
    });

    patchJob(projectId, jobId, { state: 'done', progress: 100 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'upload failed';
    patchJob(projectId, jobId, { state: 'error', detail });
    // Surface to the user via toast at the call site (the store doesn't
    // know about sonner). Errors stay in the row for visibility.
  }
}

/**
 * Enqueue a batch of files for a project. Returns immediately with the
 * generated job ids; uploads run sequentially in the background and
 * mutate the store as they progress. Subscribe via
 * `subscribeToCompletion` to know when a project's last batch finishes.
 */
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

/** True if any job for this project is still in-flight (queued/signing/
 *  uploading/finalizing). Used for the "n uploading" pill on the
 *  project list row. */
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
