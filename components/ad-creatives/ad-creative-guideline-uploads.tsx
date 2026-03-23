'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileUp, Loader2, Paperclip } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { BRAND_DNA_BENTO_SURFACE } from '@/components/brand-dna/brand-dna-cards';

const ACCEPT =
  'image/png,image/jpeg,image/jpg,image/svg+xml,image/webp,application/pdf,text/plain,text/markdown,.md,.txt,.docx';

interface AdCreativeGuidelineUploadsProps {
  clientId: string;
  /** Sidebar vs full-width panel */
  variant?: 'default' | 'compact';
}

/**
 * Upload many reference files (images, PDFs, markdown, Word) for a client.
 * Stored as imported knowledge entries and merged into ad generation prompts + image refs.
 */
export function AdCreativeGuidelineUploads({ clientId, variant = 'default' }: AdCreativeGuidelineUploadsProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [queue, setQueue] = useState<File[]>([]);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setUploading(true);
      try {
        const formData = new FormData();
        for (const f of files) {
          formData.append('files', f);
        }
        const res = await fetch(`/api/clients/${clientId}/brand-dna/upload`, {
          method: 'POST',
          body: formData,
        });
        const data = (await res.json().catch(() => ({}))) as {
          entryIds?: string[];
          textContent?: string;
          error?: string;
        };
        if (!res.ok) {
          throw new Error(typeof data.error === 'string' ? data.error : 'Upload failed');
        }
        const n = data.entryIds?.length ?? files.length;
        toast.success(`${n} file${n === 1 ? '' : 's'} added`, {
          description: 'Included in the next ad generation run (copy + images).',
        });
        setQueue([]);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Upload failed');
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [clientId, router],
  );

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files ? Array.from(e.target.files) : [];
    if (picked.length === 0) return;
    if (variant === 'compact') {
      void uploadFiles(picked);
      return;
    }
    setQueue((prev) => [...prev, ...picked]);
    if (inputRef.current) inputRef.current.value = '';
  };

  const onUploadQueued = () => {
    if (queue.length === 0) return;
    void uploadFiles(queue);
  };

  const removeQueued = (i: number) => {
    setQueue((prev) => prev.filter((_, idx) => idx !== i));
  };

  if (variant === 'compact') {
    return (
      <div className={`${BRAND_DNA_BENTO_SURFACE} p-3`}>
        <p className="text-[11px] font-medium text-text-primary mb-2">Reference uploads</p>
        <p className="text-[10px] text-text-muted leading-snug mb-2">
          PDFs, images, .md — fed into static ad generation.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={onPick}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full border-white/10 text-[11px]"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <>
              <Loader2 size={12} className="animate-spin shrink-0" />
              Uploading…
            </>
          ) : (
            <>
              <Paperclip size={12} className="shrink-0" />
              Add files
            </>
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className={`${BRAND_DNA_BENTO_SURFACE} p-4 sm:p-5`}>
      <div className="flex items-start gap-2 mb-2">
        <FileUp size={16} className="text-accent-text shrink-0 mt-0.5" />
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Creative reference files</h3>
          <p className="text-xs text-text-muted mt-1 leading-relaxed">
            Upload brand guidelines (PDF, Word), mood boards, packaging shots, or notes (Markdown/text). Up to 40 files
            per batch; each up to 50&nbsp;MB. Text and images are pulled into ad copy and image generation automatically.
          </p>
        </div>
      </div>

      <label className="mt-3 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/12 bg-white/[0.02] px-4 py-6 text-center transition-colors hover:border-accent/30 hover:bg-white/[0.04]">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          onChange={onPick}
        />
        <span className="text-xs font-medium text-text-secondary">Drop files or click to add to queue</span>
        <span className="text-[10px] text-text-muted">PNG, JPG, WebP, SVG, PDF, DOCX, MD, TXT</span>
      </label>

      {queue.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] font-medium text-text-muted">Queued ({queue.length})</p>
          <ul className="max-h-32 space-y-1 overflow-y-auto text-[11px] text-text-secondary [scrollbar-width:thin]">
            {queue.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-2 py-1">
                <span className="truncate">{f.name}</span>
                <button
                  type="button"
                  className="shrink-0 text-text-muted hover:text-red-400 text-[10px] cursor-pointer"
                  onClick={() => removeQueued(i)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <Button type="button" size="sm" className="w-full sm:w-auto" disabled={uploading} onClick={onUploadQueued}>
            {uploading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Uploading…
              </>
            ) : (
              `Upload ${queue.length} file${queue.length === 1 ? '' : 's'}`
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
