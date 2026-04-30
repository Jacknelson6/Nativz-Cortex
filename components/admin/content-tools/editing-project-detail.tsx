'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
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
import { SubNav } from '@/components/ui/sub-nav';
import { ClientLogo } from '@/components/clients/client-logo';
import {
  EDITING_STATUS_LABEL,
  EDITING_TYPE_LABEL,
  type EditingProject,
  type EditingProjectStatus,
  type EditingProjectType,
  type EditingProjectVideo,
} from '@/lib/editing/types';
import { AssigneePicker } from './assignee-picker';
import { EditingShareButton } from './editing-share-button';
import { ShareHistoryPanel } from './share-history-panel';
import {
  enqueueUploads,
  getProjectUploads,
  subscribe as subscribeUploads,
  subscribeToCompletion,
  type UploadJob,
} from '@/lib/editing/upload-store';

/**
 * Detail panel for a single editing project. Drives:
 *
 *   - Inline rename, type change, status flip, notes
 *   - Drag-drop multi-video upload of edited cuts (signed URL -> direct
 *     PUT to Supabase Storage), with progress + per-video delete.
 *   - Raw footage as a single Drive folder URL link. The strategist /
 *     videographer drops a folder link rather than uploading bulk
 *     camera files into our bucket; storage cost + Supabase upload
 *     time make a folder link the right primitive there.
 *
 * The status enum runs editing -> need_approval -> revising -> approved
 * -> done (post-handoff to paid media). Selecting a status auto-stamps
 * the corresponding timestamp column server-side.
 */

const STATUS_OPTIONS: { value: EditingProjectStatus; label: string }[] = (
  Object.keys(EDITING_STATUS_LABEL) as EditingProjectStatus[]
).map((value) => ({ value, label: EDITING_STATUS_LABEL[value] }));

const TYPE_OPTIONS: { value: EditingProjectType; label: string }[] = (
  Object.keys(EDITING_TYPE_LABEL) as EditingProjectType[]
).map((value) => ({ value, label: EDITING_TYPE_LABEL[value] }));

interface DetailResponse {
  project: EditingProject;
  videos: EditingProjectVideo[];
  // Raw videos collection is left over from the previous design where
  // raw footage uploaded into Supabase. We've moved raw to a Drive
  // folder URL on the project itself — kept the field nullable so the
  // route continues to return whatever's in the table without breaking.
  raw_videos?: unknown[];
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
  const [status, setStatus] = useState<EditingProjectStatus>('editing');
  const [dragActive, setDragActive] = useState(false);
  const [tab, setTab] = useState<'details' | 'history'>('details');

  const projectId = project?.id ?? null;

  // Read upload state from the module-scoped store. The store keeps
  // running XHRs even if this dialog unmounts, so closing the dialog
  // mid-upload doesn't cancel anything; reopening picks up where we
  // left off.
  // `getProjectUploads` returns a stable EMPTY singleton when no entry
  // exists for the key, so passing '' for a closed dialog still gives us
  // a referentially-stable snapshot, satisfying React's `Object.is`
  // equality check and avoiding the infinite-render loop that a fresh
  // `[]` literal would cause.
  const uploadsKey = projectId ?? '';
  const getSnapshot = useCallback(
    () => getProjectUploads(uploadsKey),
    [uploadsKey],
  );
  const uploads = useSyncExternalStore(
    subscribeUploads,
    getSnapshot,
    getSnapshot,
  );

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
      setTab('details'); // reset to default tab on close
      // Don't clear uploads on close — they live in the module-scoped
      // store and continue running in the background. The user can
      // reopen the dialog to check progress; the store survives.
    }
  }, [open, load]);

  // When a background batch finishes for *this* project, refetch so
  // the new videos show up on the next dialog open. Subscribe even
  // while closed: the parent shell handles list refresh separately,
  // but this keeps the dialog's local data fresh too.
  useEffect(() => {
    if (!projectId) return;
    return subscribeToCompletion((finishedProjectId) => {
      if (finishedProjectId !== projectId) return;
      void load();
    });
  }, [projectId, load]);

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
    if (!confirm('Delete this video? This cannot be undone.')) return;
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

  function startUploads(files: File[]) {
    if (!projectId || files.length === 0) return;
    enqueueUploads(projectId, files);
    toast.info(
      files.length === 1
        ? 'Upload started, you can close this dialog'
        : `${files.length} uploads started, you can close this dialog`,
    );
  }

  if (!open || !project) return null;

  return (
    <Dialog open={open} onClose={onClose} title="" maxWidth="5xl" bodyClassName="p-0">
      <div className="flex h-[80vh] min-h-[560px] flex-col">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-nativz-border py-4 pl-6 pr-14">
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
            <EditingShareButton
              projectId={project.id}
              hasVideos={(data?.videos.length ?? 0) > 0}
            />
            <Button variant="ghost" size="sm" onClick={archive} aria-label="Archive">
              <Archive size={14} />
              <span className="hidden sm:inline">Archive</span>
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6 pt-2">
          <SubNav
            ariaLabel="Project sections"
            items={[
              { slug: 'details', label: 'Details' },
              { slug: 'history', label: 'History' },
            ] as const}
            active={tab}
            onChange={(s) => setTab(s)}
          />
        </div>

        {/* Body */}
        {tab === 'history' ? (
          <div className="flex-1 overflow-y-auto p-6">
            {projectId && (
              <ShareHistoryPanel
                endpoint={`/api/admin/editing/projects/${projectId}/activity`}
              />
            )}
          </div>
        ) : (
        <div className="grid flex-1 grid-cols-1 gap-6 overflow-y-auto p-6 lg:grid-cols-[1fr_320px]">
          {/* Main column: raw footage link + edited videos */}
          <div className="space-y-5">
            <Section label={`Raw footage`}>
              <div className="rounded-lg border border-nativz-border bg-surface p-3">
                <input
                  value={driveUrl}
                  onChange={(e) => setDriveUrl(e.target.value)}
                  onBlur={() => {
                    const trimmed = driveUrl.trim();
                    void patch({ drive_folder_url: trimmed || null });
                  }}
                  placeholder="Paste a Google Drive folder link"
                  className="block w-full rounded-md border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
                {driveUrl && (
                  <a
                    href={driveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-[12px] text-accent-text hover:underline"
                  >
                    Open folder <ExternalLink size={11} />
                  </a>
                )}
              </div>
            </Section>

            <Section
              label={`Edited videos${
                data?.videos.length ? ` (${data.videos.length})` : ''
              }`}
            >
              <EditedVideosBox
                loading={loading}
                videos={data?.videos ?? []}
                dragActive={dragActive}
                setDragActive={setDragActive}
                onUploadFiles={(files) => void startUploads(files)}
                onDelete={(id) => void deleteVideo(id)}
              />
            </Section>

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

            <SideField label="Strategist">
              <AssigneePicker
                projectId={project.id}
                role="strategist_id"
                currentUserId={data?.project.strategist_id ?? project.strategist_id}
                currentEmail={
                  data?.project.strategist_email ?? project.strategist_email
                }
                variant="field"
                onSaved={() => {
                  void load();
                  onChanged();
                }}
              />
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
                <p>Done {formatTimestamp(project.scheduled_at)}</p>
              )}
            </div>
          </div>
        </div>
        )}
      </div>
    </Dialog>
  );
}


function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
        {label}
      </p>
      {children}
    </div>
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

/**
 * One combined surface for edited videos: list of cards + drop zone +
 * "choose files" button live in a single dashed-border box. Empty
 * state shows the Upload icon + prompt; populated state shows cards
 * with an inline "Add more" affordance.
 */
function EditedVideosBox({
  loading,
  videos,
  dragActive,
  setDragActive,
  onUploadFiles,
  onDelete,
}: {
  loading: boolean;
  videos: EditingProjectVideo[];
  dragActive: boolean;
  setDragActive: (active: boolean) => void;
  onUploadFiles: (files: File[]) => void;
  onDelete: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const empty = !loading && videos.length === 0;

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith('video/'),
    );
    if (files.length === 0) {
      toast.error('Drop video files only');
      return;
    }
    onUploadFiles(files);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={handleDrop}
      className={`rounded-xl border-2 border-dashed p-3 transition-colors ${
        dragActive
          ? 'border-accent bg-accent-surface/30'
          : 'border-nativz-border bg-surface'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) onUploadFiles(files);
          if (inputRef.current) inputRef.current.value = '';
        }}
      />

      {loading ? (
        <div className="flex items-center justify-center py-8 text-sm text-text-muted">
          <Loader2 size={14} className="mr-2 animate-spin" />
          Loading videos...
        </div>
      ) : empty ? (
        <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
          <Upload size={18} className="text-text-muted" />
          <p className="text-sm text-text-primary">Drop video files here</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
          >
            Choose files
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {videos.map((v) => (
              <VideoCard key={v.id} video={v} onDelete={() => onDelete(v.id)} />
            ))}
          </ul>
          <div className="flex justify-center pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
            >
              <Upload size={12} className="mr-1.5" />
              Add more
            </Button>
          </div>
        </div>
      )}
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
  const sizeLabel = video.size_bytes ? formatBytes(video.size_bytes) : '';
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
