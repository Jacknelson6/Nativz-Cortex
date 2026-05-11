'use client';

// SPY-10 T25: approval queue. Lists drafted digests with approve/reject/preview
// controls. The preview opens a modal (T26). Approve/reject hits the API and
// optimistically removes the row.

import { useState } from 'react';
import { Check, Eye, Loader2, X } from 'lucide-react';
import type { DigestDraft } from '@/lib/prospects/types';
import { DigestPreviewModal } from './digest-preview-modal';

interface Props {
  initialDrafts: Array<DigestDraft & { prospect_name?: string | null }>;
}

const KIND_LABEL: Record<string, string> = {
  weekly_competitor: 'Weekly competitor',
  monthly_format: 'Monthly format',
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3600000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function DigestApprovalQueue({ initialDrafts }: Props) {
  const [drafts, setDrafts] = useState(initialDrafts);
  const [pending, setPending] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(id: string, action: 'approve' | 'reject') {
    setPending(id);
    setError(null);
    try {
      const res = await fetch(`/api/prospects/digests/${id}/${action}`, { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `status ${res.status}`);
      }
      setDrafts((d) => d.filter((row) => row.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'action failed');
    } finally {
      setPending(null);
    }
  }

  if (drafts.length === 0) {
    return (
      <div className="rounded-xl border border-white/5 bg-surface p-8 text-center">
        <div className="text-sm font-medium">All caught up.</div>
        <div className="text-xs text-white/50 mt-1">No digests waiting on approval.</div>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl border border-white/5 bg-surface divide-y divide-white/5">
        {drafts.map((d) => {
          const busy = pending === d.id;
          return (
            <div key={d.id} className="px-4 py-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{d.subject ?? d.kind}</div>
                <div className="text-xs text-white/50 mt-0.5">
                  {d.prospect_name ?? 'Prospect'} · {KIND_LABEL[d.kind] ?? d.kind} ·{' '}
                  {timeAgo(d.created_at)}
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPreviewId(d.id)}
                  className="p-2 rounded-md hover:bg-white/5 transition disabled:opacity-50"
                  title="Preview"
                >
                  <Eye className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act(d.id, 'reject')}
                  className="p-2 rounded-md hover:bg-red-500/10 hover:text-red-300 transition disabled:opacity-50"
                  title="Reject"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act(d.id, 'approve')}
                  className="p-2 rounded-md bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 transition disabled:opacity-50"
                  title="Approve & send"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      {previewId && (
        <DigestPreviewModal draftId={previewId} onClose={() => setPreviewId(null)} />
      )}
    </>
  );
}
