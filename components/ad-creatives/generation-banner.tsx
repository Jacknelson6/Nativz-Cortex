'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2 } from 'lucide-react';

interface GenerationBannerProps {
  clientId: string;
}

interface ActiveBatch {
  id: string;
  total_count: number;
  completed_count: number;
  failed_count: number;
}

export function GenerationBanner({ clientId }: GenerationBannerProps) {
  const [activeBatch, setActiveBatch] = useState<ActiveBatch | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/clients/${clientId}/ad-creatives/batches?status=generating,queued`,
      );
      if (!res.ok) return;
      const data = await res.json();
      const batches = data.batches ?? [];
      // Show the most recent active batch
      const active = batches.find((b: { status: string }) => b.status === 'generating' || b.status === 'queued');
      setActiveBatch(active ?? null);
    } catch {
      // Silent fail
    }
  }, [clientId]);

  useEffect(() => {
    poll();
    intervalRef.current = setInterval(poll, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [poll]);

  if (!activeBatch) return null;

  const done = activeBatch.completed_count + activeBatch.failed_count;
  const total = activeBatch.total_count;

  return (
    <div className="rounded-xl border border-accent/30 bg-accent-surface/30 px-4 py-2.5 flex items-center gap-3 animate-slide-down">
      <Loader2 size={16} className="animate-spin text-accent-text shrink-0" />
      <p className="text-sm text-text-secondary flex-1">
        Generating {total} ad{total !== 1 ? 's' : ''}...
        <span className="text-text-muted ml-1">
          {done === 0 ? (
            <>
              (0/{total} — AI copy and setup run first; counts tick up as each image finishes)
            </>
          ) : (
            <> ({done}/{total} done)</>
          )}
        </span>
      </p>

      <style jsx>{`
        .animate-slide-down {
          animation: slideDown 0.3s ease-out;
        }

        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
