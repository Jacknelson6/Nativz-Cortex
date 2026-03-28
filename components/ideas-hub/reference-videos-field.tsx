'use client';

import { useState, useCallback, type Dispatch, type SetStateAction } from 'react';
import { Check, Link2, Loader2, Trash2, Upload, X } from 'lucide-react';

export type ReferenceVideoItem = {
  id?: string;
  url?: string;
  file?: File;
  title: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
};

/**
 * Process pending URL-based reference rows (upload file rows are left unchanged; same as jump-to-ideas flow).
 */
export async function processPendingReferenceVideos(
  clientId: string,
  items: ReferenceVideoItem[],
  setItems: Dispatch<SetStateAction<ReferenceVideoItem[]>>,
): Promise<ReferenceVideoItem[]> {
  const updated = [...items];
  for (let i = 0; i < updated.length; i++) {
    if (updated[i].status !== 'pending' || !updated[i].url) continue;
    updated[i] = { ...updated[i], status: 'processing' };
    setItems([...updated]);
    try {
      const createRes = await fetch('/api/reference-videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, url: updated[i].url ?? null, title: updated[i].title }),
      });
      if (!createRes.ok) throw new Error('Failed');
      const { video } = await createRes.json();
      const processRes = await fetch(`/api/reference-videos/${video.id}/process`, { method: 'POST' });
      if (!processRes.ok) throw new Error('Failed');
      const { video: processed } = await processRes.json();
      updated[i] = { ...updated[i], id: processed.id, status: processed.status };
    } catch {
      updated[i] = { ...updated[i], status: 'failed' };
    }
    setItems([...updated]);
  }
  return updated;
}

export function completedReferenceVideoIds(items: ReferenceVideoItem[]): string[] {
  return items.filter((v) => v.status === 'completed' && v.id).map((v) => v.id!);
}

interface ReferenceVideosFieldProps {
  items: ReferenceVideoItem[];
  setItems: Dispatch<SetStateAction<ReferenceVideoItem[]>>;
  /** When true, dims inputs (e.g. while generating ideas) */
  disabled?: boolean;
}

export function ReferenceVideosField({ items, setItems, disabled }: ReferenceVideosFieldProps) {
  const [urlInput, setUrlInput] = useState('');

  const addReferenceUrl = useCallback(() => {
    const url = urlInput.trim();
    if (!url) return;
    setItems((prev) => [...prev, { url, title: url.split('/').pop() ?? 'Video', status: 'pending' }]);
    setUrlInput('');
  }, [urlInput, setItems]);

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-text-secondary">
        Reference videos <span className="text-text-muted font-normal">(optional)</span>
      </label>
      <div className="flex gap-2">
        <div className="flex-1 flex items-center gap-2 rounded-lg border border-nativz-border bg-background px-3 py-2">
          <Link2 size={14} className="text-text-muted shrink-0" />
          <input
            type="text"
            value={urlInput}
            disabled={disabled}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addReferenceUrl();
              }
            }}
            placeholder="Paste a video URL (YouTube, TikTok, Instagram…)"
            className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none disabled:opacity-50"
          />
        </div>
        <button
          type="button"
          onClick={addReferenceUrl}
          disabled={!urlInput.trim() || disabled}
          className="px-3 py-2 rounded-lg border border-nativz-border bg-surface text-xs font-medium text-text-secondary hover:bg-surface-hover disabled:opacity-40 cursor-pointer transition-colors"
        >
          Add
        </button>
      </div>

      <label className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-nativz-border/60 bg-background px-4 py-3 text-xs text-text-muted hover:border-accent2/40 hover:text-text-secondary transition-colors cursor-pointer has-[:disabled]:opacity-50">
        <Upload size={14} />
        Drop or click to upload video files
        <input
          type="file"
          accept="video/*"
          multiple
          disabled={disabled}
          className="hidden"
            onChange={(e) => {
            if (!e.target.files) return;
            setItems((prev) => {
              const next = [...prev];
              for (const file of Array.from(e.target.files!)) {
                if (!file.type.startsWith('video/')) continue;
                next.push({ file, title: file.name, status: 'pending' });
              }
              return next;
            });
          }}
        />
      </label>

      {items.length > 0 && (
        <div className="space-y-1.5">
          {items.map((ref, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg border border-nativz-border bg-background px-3 py-2">
              {ref.status === 'processing' && <Loader2 size={12} className="animate-spin text-accent2-text shrink-0" />}
              {ref.status === 'completed' && <Check size={12} className="text-emerald-400 shrink-0" />}
              {ref.status === 'failed' && <X size={12} className="text-red-400 shrink-0" />}
              {ref.status === 'pending' && <div className="w-3 h-3 rounded-full border-2 border-nativz-border shrink-0" />}
              <span className="text-xs text-text-secondary truncate flex-1">{ref.title}</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
                className="p-1 rounded text-text-muted hover:text-red-400 cursor-pointer disabled:opacity-40"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
