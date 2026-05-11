'use client';

// VFF-04 T13: client island for /admin/formats/rejected. Pagination + filter
// + restore. Server component on the same route streams the initial page.

import { useCallback, useEffect, useState } from 'react';
import { RejectCard } from '@/components/formats/reject-card';
import { REJECT_REASON_LABELS } from '@/lib/analytics/reject-reasons';

type Video = {
  id: string;
  platform: 'tiktok' | 'instagram' | 'youtube';
  source_url: string | null;
  creator_handle: string | null;
  thumbnail_storage_url: string | null;
  thumbnail_source_url: string | null;
  views_count: number | null;
  duration_seconds: number | null;
  reject_reason: string;
  gate_metadata: Record<string, unknown>;
  posted_at: string | null;
  created_at: string;
};

type Props = {
  initialVideos: Video[];
  initialTotal: number;
  initialPage: number;
  pageSize: number;
};

const REASON_OPTIONS = ['', ...Object.keys(REJECT_REASON_LABELS)];
const PLATFORM_OPTIONS = ['', 'tiktok', 'instagram', 'youtube'] as const;

export function RejectedGrid({
  initialVideos,
  initialTotal,
  initialPage,
  pageSize,
}: Props) {
  const [videos, setVideos] = useState<Video[]>(initialVideos);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [reason, setReason] = useState('');
  const [platform, setPlatform] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const fetchPage = useCallback(
    async (opts: { page: number; reason: string; platform: string }) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(opts.page),
          page_size: String(pageSize),
        });
        if (opts.reason) params.set('reason', opts.reason);
        if (opts.platform) params.set('platform', opts.platform);
        const res = await fetch(`/api/admin/formats/rejected?${params.toString()}`);
        if (!res.ok) return;
        const json = (await res.json()) as {
          videos: Video[];
          total: number;
          page: number;
        };
        setVideos(json.videos);
        setTotal(json.total);
        setPage(json.page);
      } finally {
        setLoading(false);
      }
    },
    [pageSize],
  );

  useEffect(() => {
    // Fetch when filters change (skip on first mount).
    if (reason === '' && platform === '' && page === initialPage) return;
    fetchPage({ page, reason, platform });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reason, platform, page]);

  const handleRestore = async (id: string) => {
    const res = await fetch(`/api/admin/formats/rejected/${id}/restore`, {
      method: 'POST',
    });
    if (res.ok) {
      setVideos((prev) => prev.filter((v) => v.id !== id));
      setTotal((t) => Math.max(0, t - 1));
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-white/5 bg-background/95 py-3 backdrop-blur">
        <label className="text-xs text-white/60">Reason</label>
        <select
          value={reason}
          onChange={(e) => {
            setPage(1);
            setReason(e.target.value);
          }}
          className="rounded-md border border-white/10 bg-surface px-2 py-1 text-xs text-white"
        >
          {REASON_OPTIONS.map((slug) => (
            <option key={slug || 'all'} value={slug}>
              {slug ? (REJECT_REASON_LABELS as Record<string, string>)[slug] : 'All reasons'}
            </option>
          ))}
        </select>
        <label className="ml-3 text-xs text-white/60">Platform</label>
        <select
          value={platform}
          onChange={(e) => {
            setPage(1);
            setPlatform(e.target.value);
          }}
          className="rounded-md border border-white/10 bg-surface px-2 py-1 text-xs text-white"
        >
          {PLATFORM_OPTIONS.map((p) => (
            <option key={p || 'all'} value={p}>
              {p ? p.charAt(0).toUpperCase() + p.slice(1) : 'All platforms'}
            </option>
          ))}
        </select>
        <div className="ml-auto text-xs text-white/50">
          {total.toLocaleString()} rejected · page {page}/{totalPages}
        </div>
      </div>

      {videos.length === 0 ? (
        <p className="py-12 text-center text-sm text-white/50">
          Nothing rejected yet. The gate has not run.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {videos.map((v) => (
            <RejectCard key={v.id} video={v} onRestore={handleRestore} />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1 || loading}
          className="rounded-md border border-white/10 px-3 py-1 text-xs text-white/70 hover:border-accent disabled:opacity-30"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages || loading}
          className="rounded-md border border-white/10 px-3 py-1 text-xs text-white/70 hover:border-accent disabled:opacity-30"
        >
          Next
        </button>
      </div>
    </div>
  );
}
