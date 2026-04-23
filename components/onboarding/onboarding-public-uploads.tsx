'use client';

import { useCallback, useRef, useState } from 'react';
import { Upload, Loader2, CheckCircle2, FileText } from 'lucide-react';
import { toast } from 'sonner';

type UploadRow = {
  id: string;
  filename: string;
  size_bytes: number | null;
  mime_type: string | null;
  created_at: string;
};

/**
 * Drag-drop upload zone rendered on the public /onboarding/[slug] page so
 * clients can hand over brand assets, videos, and reference material
 * without any separate portal or email attachment shuffling.
 *
 * Files hit POST /api/onboarding/public/upload scoped by the share token.
 * On success we append the row to local state so the client sees immediate
 * confirmation; no full page refresh needed.
 */
export function OnboardingPublicUploads({
  shareToken,
  initialUploads,
}: {
  shareToken: string;
  initialUploads: UploadRow[];
}) {
  const [uploads, setUploads] = useState<UploadRow[]>(initialUploads);
  const [dragActive, setDragActive] = useState(false);
  const [busyCount, setBusyCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;

      // Upload files in parallel; each is its own fetch + state update.
      setBusyCount((n) => n + list.length);
      await Promise.all(
        list.map(async (file) => {
          try {
            const form = new FormData();
            form.append('share_token', shareToken);
            form.append('file', file);
            const res = await fetch('/api/onboarding/public/upload', {
              method: 'POST',
              body: form,
            });
            if (!res.ok) {
              const d = await res.json().catch(() => ({}));
              throw new Error((d as { error?: string }).error || 'Upload failed');
            }
            const { upload } = (await res.json()) as { upload: UploadRow };
            setUploads((xs) => [upload, ...xs]);
            toast.success(`${file.name} uploaded`);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : `Couldn't upload ${file.name}`);
          } finally {
            setBusyCount((n) => n - 1);
          }
        }),
      );
    },
    [shareToken],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length) {
        void handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles],
  );

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[22px] font-semibold">Share files</h2>
        <p className="text-[13px] text-text-muted">
          Drop anything useful here — brand assets, reference clips, product shots. Up to 10 MB per file.
        </p>
      </div>

      <label
        onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center gap-2 rounded-[10px] border-2 border-dashed px-6 py-10 cursor-pointer transition-colors ${
          dragActive
            ? 'border-accent-text bg-accent-surface/30'
            : 'border-nativz-border/60 bg-surface hover:bg-surface-hover/30'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void handleFiles(e.target.files);
            // Reset so picking the same file twice still fires change.
            e.target.value = '';
          }}
        />
        <div className="h-11 w-11 rounded-full bg-accent-surface text-accent-text flex items-center justify-center">
          {busyCount > 0 ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
        </div>
        <p className="text-[14px] font-semibold text-text-primary">
          {busyCount > 0 ? `Uploading ${busyCount} file${busyCount === 1 ? '' : 's'}\u2026` : 'Drop files to upload'}
        </p>
        <p className="text-[12px] text-text-muted">or click to browse</p>
      </label>

      {uploads.length > 0 && (
        <ul className="rounded-[10px] border border-nativz-border bg-surface overflow-hidden divide-y divide-nativz-border">
          {uploads.map((u) => (
            <li key={u.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="h-8 w-8 shrink-0 rounded-md bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                <CheckCircle2 size={15} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-text-primary truncate">{u.filename}</p>
                <p className="text-[11px] text-text-muted">
                  {u.size_bytes != null ? formatBytes(u.size_bytes) : 'uploaded'}
                </p>
              </div>
              <FileText size={14} className="text-text-muted shrink-0" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
