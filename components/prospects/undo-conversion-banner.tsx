// SPY-07 T11: Undo banner — 1-hour grace period after a conversion.
// Renders only when there's still time on the clock. Calls
// /api/prospects/[prospectId]/convert/undo, deletes the new client, and
// restores the prospect. Confirm gate prevents accidental reversal.

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, Loader2, Undo2 } from 'lucide-react';

interface UndoConversionBannerProps {
  prospectId: string;
  /** ISO timestamp of when the prospect was archived (conversion moment). */
  archivedAt: string;
  /** Total window in minutes (default 60). */
  windowMinutes?: number;
}

export function UndoConversionBanner({
  prospectId,
  archivedAt,
  windowMinutes = 60,
}: UndoConversionBannerProps) {
  const router = useRouter();
  const expiresAt = new Date(archivedAt).getTime() + windowMinutes * 60_000;
  const [now, setNow] = useState(() => Date.now());
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  const remainingMs = expiresAt - now;
  if (remainingMs <= 0) return null;

  const mins = Math.floor(remainingMs / 60_000);
  const secs = Math.floor((remainingMs % 60_000) / 1000);
  const label = `${mins}:${String(secs).padStart(2, '0')}`;

  async function handleUndo() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/prospects/${prospectId}/convert/undo`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? 'Undo failed');
        return;
      }
      toast.success('Conversion undone — prospect restored');
      router.push(`/admin/prospects/${prospectId}`);
      router.refresh();
    } catch (err) {
      console.error('Undo conversion failed', err);
      toast.error('Unexpected error');
    } finally {
      setSubmitting(false);
      setConfirming(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
      <div className="flex items-center gap-2.5">
        <AlertTriangle size={16} className="shrink-0 text-amber-300" />
        <div>
          <div className="font-medium">Just converted from a prospect</div>
          <div className="text-xs text-amber-200/80">
            You have <span className="font-mono">{label}</span> to undo — this
            will delete the new client and restore the prospect.
          </div>
        </div>
      </div>
      {confirming ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={submitting}
            className="rounded-lg px-2.5 py-1.5 text-xs text-amber-200 hover:bg-amber-500/20 transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleUndo}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/80 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 transition-colors cursor-pointer disabled:opacity-50"
          >
            {submitting ? <Loader2 size={12} className="animate-spin" /> : <Undo2 size={12} />}
            Confirm undo
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-500/20 transition-colors cursor-pointer"
        >
          <Undo2 size={12} />
          Undo conversion
        </button>
      )}
    </div>
  );
}
