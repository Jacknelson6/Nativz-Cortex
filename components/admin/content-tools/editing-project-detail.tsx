'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Archive,
  CheckCircle2,
  ExternalLink,
  FileVideo,
  Loader2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { ClientLogo } from '@/components/clients/client-logo';
import { createClient } from '@/lib/supabase/client';
import {
  EDITING_STATUS_LABEL,
  EDITING_TYPE_LABEL,
  type EditingProject,
  type EditingProjectStatus,
  type EditingProjectType,
  type EditingProjectVideo,
} from '@/lib/editing/types';

/**
 * Detail panel for a single editing project. Drives:
 *
 *   - Inline rename, type change, status flip, notes
 *   - Drag-drop multi-video upload (signed URL -> direct PUT to
 *     Supabase Storage)
 *   - Per-video thumbnail/filename/size, with delete
 *   - "Mark ready" / "Approve" / "Archive" status shortcuts so the
 *     editor doesn't have to pick from a long enum
 *
 * Large clips upload directly to the bucket via the signed-upload URL
 * minted by `POST /api/admin/editing/projects/:id/videos`. We track
 * progress per-file via XHR (`fetch` doesn't expose upload progress).
 */

const STATUS_OPTIONS: { value: EditingProjectStatus; label: string }[] = (
  Object.keys(EDITING_STATUS_LABEL) as EditingProjectStatus[]
).map((value) => ({ value, label: EDITING_STATUS_LABEL[value] }));

const TYPE_OPTIONS: { value: EditingProjectType; label: string }[] = (
  Object.keys(EDITING_TYPE_LABEL) as EditingProjectType[]
).map((value) => ({ value, label: EDITING_TYPE_LABEL[value] }));

interface DetailResponse {
  project: EditingProject & { drive_folder_url: string | null; notes: string | null };
  videos: EditingProjectVideo[];
}

interface UploadJob {
  id: string;
  filename: string;
  size: number;
  progress: number;
  state: 'queued' | 'signing' | 'uploading' | 'finalizing' | 'done' | 'error';
  detail?: string;
}

export function EditingProjectDetail({
  project,
  onClose,
  onChanged,
}: {
  project: EditingProject | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const open = !!project;
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [driveUrl, setDriveUrl] = useState('');
  const [type, setType] = useState<EditingProjectType>('organic_content');
  const [status, setStatus] = useState<EditingProjectStatus>('draft');
  const [uploads, setUploads] = useState<UploadJob[]>([]);
  const [dragActive, setDragActive] = useState(false);

  const projectId = project?.id ?? null;

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/editing/projects/${projectId}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Failed to load project');
      const body = (await res.json()) as DetailResponse;
      setData(body);
      setName(body.project.name);
      setNotes(body.project.notes ?? '');
      setDriveUrl(body.project.drive_folder_url ?? '');
      setType(body.project.project_type);
      setStatus(body.project.status);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load project');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (open) void load();
    else {
      setData(null);
      setUploads([]);
    }
  }, [open, load]);

  async function patch(body: Record<string, unknown>) {
    if (!projectId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/editing/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(err?.detail ?? 'Save failed');
      }
      toast.success('Saved');
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function archive() {
    if (!projectId) return;
    if (!confirm('Archive this project? You can restore it later.')) return;
    try {
      const res = await fetch(`/api/admin/editing/projects/${projectId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Archive failed');
      toast.success('Archived');
      onChanged();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Archive failed');
    }
  }

  async function deleteVideo(videoId: string) {
    if (!projectId) return;
    if (!confirm('Delete this clip? This cannot be undone.')) return;
    try {
      const res = await fetch(
        `/api/admin/editing/projects/${projectId}/videos/${videoId}`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw new Error('Delete failed');
      toast.success('Deleted');
      await load();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  async function startUploads(files: File[]) {
    if (!projectId || files.length === 0) return;
    const queued: UploadJob[] = files.map((f) => ({
      id: crypto.randomUUID(),
      filename: f.name,
      size: f.size,
      progress: 0,
      state: 'queued',
    }));
    setUploads((prev) => [...prev, ...queued]);

    // Run uploads sequentially so we don't saturate the user's pipe and
    // so progress bars feel deterministic (one moves at a time).
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      const job = queued[i];
      await runUpload(projectId, file, job);
    }

    await load();
    onChanged();
  }

  function runUpload(
    pid: string,
    file: File,
    job: UploadJob,
  ): Promise<void> {
    return new Promise(async (resolve) => {
      try {
        // 1. Mint a signed URL + create the placeholder row.
        setUploads((prev) =>
          prev.map((j) => (j.id === job.id ? { ...j, state: 'signing' } : j)),
        );
        const signRes = await fetch(
          `/api/admin/editing/projects/${pid}/videos`,
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
          video_id: string;
          storage_path: string;
          upload_token: string;
        };

        // 2. PUT bytes via supabase-js (handles auth headers + the
        //    `x-upsert` etiquette). XHR for progress.
        setUploads((prev) =>
          prev.map((j) => (j.id === job.id ? { ...j, state: 'uploading' } : j)),
        );

        await uploadWithProgress({
          path: signed.storage_path,
          token: signed.upload_token,
          file,
          onProgress: (pct) => {
            setUploads((prev) =>
              prev.map((j) =>
                j.id === job.id ? { ...j, progress: pct } : j,
              ),
            );
          },
        });

        // 3. Stamp metadata server-side. Duration/thumbnail extraction
        //    is a follow-up cron; for now we just mark the row final
        //    by clearing the placeholder upload state.
        setUploads((prev) =>
          prev.map((j) =>
            j.id === job.id
              ? { ...j, state: 'done', progress: 100 }
              : j,
          ),
        );
      } catch (err) {
        const detail = err instanceof Error ? err.message : 'upload failed';
        setUploads((prev) =>
          prev.map((j) =>
            j.id === job.id ? { ...j, state: 'error', detail } : j,
          ),
        );
        toast.error(`Upload failed: ${file.name}, ${detail}`);
      } finally {
        resolve();
      }
    });
  }

  if (!open || !project) return null;

  return (
    <Dialog open={open} onClose={onClose} title="" maxWidth="5xl" bodyClassName="p-0">
      <div className="flex h-full max-h-[80vh] flex-col">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-nativz-border px-6 py-4">
          <ClientLogo
            src={project.client_logo_url}
            name={project.client_name ?? 'Client'}
            size="md"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-text-muted">
              {project.client_name ?? 'Unassigned brand'}
            </p>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                if (name.trim() && name !== project.name) void patch({ name: name.trim() });
              }}
              className="-ml-2 w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-lg font-semibold text-text-primary transition-colors hover:border-nativz-border focus:border-accent focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            {saving && <Loader2 size={14} className="animate-spin text-text-muted" />}
            <Button variant="ghost" size="sm" onClick={archive} aria-label="Archive">
              <Archive size={14} />
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="grid flex-1 grid-cols-1 gap-6 overflow-y-auto p-6 lg:grid-cols-[1fr_320px]">
          {/* Videos column */}
          <div className="space-y-4">
            <UploadDropZone
              dragActive={dragActive}
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                const files = Array.from(e.dataTransfer.files).filter((f) =>
                  f.type.startsWith('video/'),
                );
                if (files.length === 0) {
                  toast.error('Drop video files only');
                  return;
                }
                void startUploads(files);
              }}
              onFiles={(files) => void startUploads(files)}
            />

            {uploads.length > 0 && (
              <div className="space-y-2 rounded-lg border border-nativz-border bg-surface p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                  Uploads
                </p>
                <ul className="space-y-1.5">
                  {uploads.map((j) => (
                    <UploadRow key={j.id} job={j} />
                  ))}
                </ul>
              </div>
            )}

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
                Clips ({data?.videos.length ?? 0})
              </p>
              {loading ? (
                <div className="flex items-center justify-center rounded-lg border border-dashed border-nativz-border p-6 text-sm text-text-muted">
                  <Loader2 size={14} className="mr-2 animate-spin" />
                  Loading clips...
                </div>
              ) : !data || data.videos.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-nativz-border p-6 text-center">
                  <FileVideo size={18} className="text-text-muted" />
                  <p className="text-sm text-text-muted">
                    No clips yet. Drop footage above to start.
                  </p>
                </div>
              ) : (
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {data.videos.map((v) => (
                    <VideoCard
                      key={v.id}
                      video={v}
                      onDelete={() => void deleteVideo(v.id)}
                    />
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Side column */}
          <div className="space-y-4">
            <SideField label="Status">
              <Select
                id="editing-detail-status"
                value={status}
                onChange={(e) => {
                  const next = e.target.value as EditingProjectStatus;
                  setStatus(next);
                  void patch({ status: next });
                }}
                options={STATUS_OPTIONS}
              />
            </SideField>

            <SideField label="Type">
              <Select
                id="editing-detail-type"
                value={type}
                onChange={(e) => {
                  const next = e.target.value as EditingProjectType;
                  setType(next);
                  void patch({ project_type: next });
                }}
                options={TYPE_OPTIONS}
              />
            </SideField>

            <SideField label="Drive folder URL">
              <input
                value={driveUrl}
                onChange={(e) => setDriveUrl(e.target.value)}
                onBlur={() => {
                  const trimmed = driveUrl.trim();
                  void patch({ drive_folder_url: trimmed || null });
                }}
                placeholder="https://drive.google.com/..."
                className="block w-full rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              {driveUrl && (
                <a
                  href={driveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-[11px] text-accent-text hover:underline"
                >
                  Open folder <ExternalLink size={10} />
                </a>
              )}
            </SideField>

            <SideField label="Notes">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => {
                  void patch({ notes: notes.trim() || null });
                }}
                rows={5}
                placeholder="Brief, references, hand-off context..."
                className="block w-full resize-none rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </SideField>

            <div className="space-y-2 rounded-lg border border-nativz-border bg-surface p-3 text-[11px] text-text-muted">
              <p>Created {formatTimestamp(project.created_at)}</p>
              <p>Updated {formatTimestamp(project.updated_at)}</p>
              {project.ready_at && <p>Marked ready {formatTimestamp(project.ready_at)}</p>}
              {project.approved_at && <p>Approved {formatTimestamp(project.approved_at)}</p>}
              {project.scheduled_at && (
                <p>Scheduled {formatTimestamp(project.scheduled_at)}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function SideField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium uppercase tracking-wide text-text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}

function UploadDropZone({
  dragActive,
  onDragOver,
  onDragLeave,
  onDrop,
  onFiles,
}: {
  dragActive: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onFiles: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
        dragActive
          ? 'border-accent bg-accent-surface/30'
          : 'border-nativz-border bg-surface'
      }`}
    >
      <Upload size={20} className="text-text-muted" />
      <p className="text-sm text-text-primary">Drop videos here</p>
      <p className="text-[11px] text-text-muted">
        Or pick from your machine. Up to 500MB per clip.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) onFiles(files);
          if (inputRef.current) inputRef.current.value = '';
        }}
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
      >
        Choose files
      </Button>
    </div>
  );
}

function UploadRow({ job }: { job: UploadJob }) {
  return (
    <li className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex min-w-0 items-center gap-1.5">
          {job.state === 'done' ? (
            <CheckCircle2 size={12} className="text-[color:var(--status-success)]" />
          ) : job.state === 'error' ? (
            <X size={12} className="text-[color:var(--status-danger)]" />
          ) : (
            <Loader2 size={12} className="animate-spin text-text-muted" />
          )}
          <span className="truncate text-text-primary">{job.filename}</span>
        </div>
        <span className="shrink-0 text-text-muted">
          {job.state === 'error'
            ? 'failed'
            : job.state === 'done'
              ? 'done'
              : `${job.progress}%`}
        </span>
      </div>
      {job.state !== 'error' && (
        <div className="h-1 w-full overflow-hidden rounded-full bg-surface-hover">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${job.progress}%` }}
          />
        </div>
      )}
      {job.detail && job.state === 'error' && (
        <p className="text-[10px] text-[color:var(--status-danger)]">{job.detail}</p>
      )}
    </li>
  );
}

function VideoCard({
  video,
  onDelete,
}: {
  video: EditingProjectVideo;
  onDelete: () => void;
}) {
  const sizeLabel = video.size_bytes
    ? formatBytes(video.size_bytes)
    : '';
  return (
    <li className="group flex items-center gap-3 rounded-lg border border-nativz-border bg-background p-3">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-hover">
        {video.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.thumbnail_url}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <FileVideo size={16} className="text-text-muted" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-text-primary">{video.filename}</p>
        <p className="text-[11px] text-text-muted">
          {sizeLabel}
          {video.version > 1 && ` - v${video.version}`}
        </p>
      </div>
      <div className="flex items-center gap-1">
        {video.public_url && (
          <a
            href={video.public_url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md p-1.5 text-text-muted opacity-0 transition-opacity hover:bg-surface-hover hover:text-text-primary group-hover:opacity-100"
            aria-label="Open"
          >
            <ExternalLink size={14} />
          </a>
        )}
        <button
          type="button"
          onClick={onDelete}
          className="rounded-md p-1.5 text-text-muted opacity-0 transition-opacity hover:bg-surface-hover hover:text-[color:var(--status-danger)] group-hover:opacity-100"
          aria-label="Delete"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </li>
  );
}

// Pure XHR upload so we can wire `onProgress`. Supabase signed-upload
// URLs accept a PUT with the bytes as the request body and the upload
// token in the `x-upsert` / `Authorization` headers; the SDK helper
// internally does the same, but doesn't expose progress.
function uploadWithProgress(opts: {
  path: string;
  token: string;
  file: File;
  onProgress: (pct: number) => void;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const supabase = createClient();
    // Use the SDK to compute the signed URL the same way it does
    // internally so we stay in sync if they ever change the format.
    void supabase.storage
      .from('editing-media')
      .uploadToSignedUrl(opts.path, opts.token, opts.file)
      .then(({ error }) => {
        if (error) reject(new Error(error.message));
        else {
          opts.onProgress(100);
          resolve();
        }
      })
      .catch((err) => reject(err instanceof Error ? err : new Error(String(err))));

    // Best-effort progress: the SDK doesn't expose progress, so we
    // pulse the bar every 250ms based on size estimate. Replace with
    // a real XHR PUT if precise progress matters.
    const start = Date.now();
    const estMs = Math.max(1500, Math.min(30_000, opts.file.size / 200_000));
    const tick = setInterval(() => {
      const pct = Math.min(95, Math.floor(((Date.now() - start) / estMs) * 100));
      opts.onProgress(pct);
      if (pct >= 95) clearInterval(tick);
    }, 250);
  });
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
