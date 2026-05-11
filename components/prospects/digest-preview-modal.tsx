'use client';

// SPY-10 T26: preview modal. Renders the digest HTML inside an iframe so any
// inline styles are sandboxed from the host page.

import { useEffect } from 'react';
import { X } from 'lucide-react';

interface Props {
  draftId: string;
  onClose: () => void;
}

export function DigestPreviewModal({ draftId, onClose }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl h-[80vh] rounded-2xl border border-white/10 bg-surface overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <div className="text-sm font-medium">Digest preview</div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-white/5 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <iframe
          src={`/api/prospects/digests/${draftId}/preview`}
          className="flex-1 w-full bg-white"
          title="Digest preview"
        />
      </div>
    </div>
  );
}
