'use client';

import { useRef } from 'react';
import { toast } from 'sonner';
import {
  CheckCircle2,
  ExternalLink,
  FileVideo,
  Loader2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { EditingProjectVideo } from '@/lib/editing/types';
import type { UploadJob } from '@/lib/editing/upload-store';

/**
 * Edited videos uploader + grid. Shared between EditingProjectDetail
 * (the dedicated /admin/editing dialog) and CalendarLinkDetail (the
 * calendar share-link dialog at /admin/content-tools), so admins can
 * drop edited cuts straight onto a calendar without bouncing through
 * the editing board.
 *
 * Empty state shows a drop zone + Choose files button. Populated state
 * shows a single-column list of cards with hover-revealed open + delete
 * affordances.
 */
export function EditedVideosBox({
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
          <ul className="grid grid-cols-1 gap-2">
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

export function UploadRow({ job }: { job: UploadJob }) {
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

/**
 * Renders a small first-frame preview for an uploaded edit. We don't
 * have a worker that pre-generates thumbnail_url yet, so without this
 * we'd fall through to a generic file icon for every video. A muted
 * <video> with #t=0.1 makes the browser fetch only the first ~100ms
 * and paint that frame, enough to recognize the cut at a glance.
 */
function VideoThumb({ video }: { video: EditingProjectVideo }) {
  const previewSrc = video.public_url ? `${video.public_url}#t=0.1` : null;
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-hover">
      {video.thumbnail_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={video.thumbnail_url}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : previewSrc ? (
        <video
          src={previewSrc}
          className="h-full w-full object-cover"
          preload="metadata"
          muted
          playsInline
        />
      ) : (
        <FileVideo size={16} className="text-text-muted" />
      )}
    </div>
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
  const status = video.review_status ?? null;
  return (
    <li className="group flex items-center gap-3 rounded-lg border border-nativz-border bg-background p-3">
      <VideoThumb video={video} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm text-text-primary">{video.filename}</p>
          {status === 'approved' && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
              <CheckCircle2 size={10} /> Approved
            </span>
          )}
          {status === 'changes_requested' && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
              Needs changes
            </span>
          )}
        </div>
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
