'use client';

// VFF-04 T12: slim 9:16 card for rejected viral_videos.
// Lighter than the future VFF-08 thumbnail card; just thumbnail + reason badge
// + handle/views/restore action.

import { useState } from 'react';
import { rejectReasonLabel } from '@/lib/analytics/reject-reasons';

type Props = {
  video: {
    id: string;
    platform: 'tiktok' | 'instagram' | 'youtube';
    thumbnail_storage_url: string | null;
    thumbnail_source_url: string | null;
    creator_handle: string | null;
    views_count: number | null;
    reject_reason: string;
  };
  onRestore: (id: string) => Promise<void>;
};

const PLATFORM_TINT: Record<Props['video']['platform'], string> = {
  tiktok: 'bg-fuchsia-950/40 text-fuchsia-200',
  instagram: 'bg-amber-950/40 text-amber-200',
  youtube: 'bg-rose-950/40 text-rose-200',
};

function formatViews(n: number | null): string {
  if (n == null) return '—';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function RejectCard({ video, onRestore }: Props) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const thumb = video.thumbnail_storage_url ?? video.thumbnail_source_url ?? null;

  const handleRestore = async () => {
    if (busy || done) return;
    setBusy(true);
    try {
      await onRestore(video.id);
      setDone(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border border-white/5 bg-surface">
      <div className="relative aspect-[9/16] w-full overflow-hidden">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt=""
            className="h-full w-full object-cover transition group-hover:scale-[1.02]"
            loading="lazy"
          />
        ) : (
          <div className={`flex h-full w-full items-center justify-center ${PLATFORM_TINT[video.platform]}`}>
            <span className="text-xs uppercase tracking-wider opacity-60">
              {video.platform}
            </span>
          </div>
        )}
        <div className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/90">
          {rejectReasonLabel(video.reject_reason)}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 p-2 text-xs">
        <div className="min-w-0 truncate text-white/70">
          <span className="truncate">{video.creator_handle ?? '—'}</span>
          <span className="ml-1 text-white/40">· {formatViews(video.views_count)}</span>
        </div>
        <button
          type="button"
          onClick={handleRestore}
          disabled={busy || done}
          className="shrink-0 rounded-md border border-white/10 px-2 py-1 text-[11px] text-white/70 transition hover:border-accent hover:text-accent disabled:opacity-40"
        >
          {done ? 'Restored' : busy ? 'Restoring…' : 'Restore'}
        </button>
      </div>
    </div>
  );
}
