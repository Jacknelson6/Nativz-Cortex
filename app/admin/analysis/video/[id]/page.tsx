'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Film, Clock, Eye, Heart, MessageCircle, Share2,
  ExternalLink, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VideoAnalysisPanel } from '@/components/moodboard/video-analysis-panel';
import { ReplicationBriefModal } from '@/components/moodboard/replication-brief-modal';
import { toast } from 'sonner';
import type { MoodboardItem } from '@/lib/types/moodboard';

const PLATFORM_COLORS: Record<string, string> = {
  tiktok: 'bg-black text-white',
  youtube: 'bg-red-600 text-white',
  instagram: 'bg-gradient-to-r from-accent2 to-pink-500 text-white',
  facebook: 'bg-blue-600 text-white',
  twitter: 'bg-sky-500 text-white',
};

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function VideoAnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [item, setItem] = useState<MoodboardItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replicateItem, setReplicateItem] = useState<MoodboardItem | null>(null);

  const fetchItem = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/analysis/items/${id}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to load' }));
        throw new Error(data.error ?? 'Failed to load video analysis');
      }
      const data = await res.json();
      setItem(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load video analysis';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchItem();
  }, [fetchItem]);

  const handleClose = useCallback(() => {
    router.push('/admin/analysis');
  }, [router]);

  const handleReplicate = useCallback((replicatingItem: MoodboardItem) => {
    setReplicateItem(replicatingItem);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 size={28} className="animate-spin text-accent-text mx-auto mb-3" />
          <p className="text-sm text-text-muted">Loading analysis...</p>
        </div>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <Film size={28} className="text-text-muted/40 mx-auto" />
          <p className="text-sm text-text-muted">{error ?? 'Video not found'}</p>
          <Button variant="secondary" onClick={() => router.push('/admin/analysis')}>
            <ArrowLeft size={14} />
            Back to analysis
          </Button>
        </div>
      </div>
    );
  }

  const platform = item.platform ?? 'unknown';
  const platformClass = PLATFORM_COLORS[platform] ?? 'bg-gray-600 text-white';

  return (
    <div className="p-6 pb-12">
      <div className="mx-auto max-w-[800px]">
        {/* Back button */}
        <button
          onClick={handleClose}
          className="cursor-pointer flex items-center gap-1.5 text-sm text-text-muted hover:text-text-secondary transition-colors mb-6"
        >
          <ArrowLeft size={14} />
          Back to analysis
        </button>

        {/* Video header */}
        <div className="rounded-xl border border-nativz-border bg-surface p-5 mb-6">
          <div className="flex items-start gap-4">
            {/* Thumbnail */}
            {item.thumbnail_url && (
              <div className="shrink-0 w-20 h-20 rounded-lg overflow-hidden border border-nativz-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.thumbnail_url}
                  alt={item.title ?? 'Video thumbnail'}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-semibold text-text-primary leading-snug line-clamp-2">
                {item.title ?? 'Untitled video'}
              </h1>

              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${platformClass}`}>
                  {platform}
                </span>

                {item.author_name && (
                  <span className="text-xs text-text-muted">
                    {item.author_name}
                    {item.author_handle ? ` @${item.author_handle}` : ''}
                  </span>
                )}

                {item.duration != null && (
                  <span className="text-xs text-text-muted flex items-center gap-1">
                    <Clock size={11} />
                    {Math.floor(item.duration / 60)}:{String(item.duration % 60).padStart(2, '0')}
                  </span>
                )}
              </div>

              {/* Stats row */}
              {item.stats && (
                <div className="flex items-center gap-4 mt-2.5">
                  {item.stats.views > 0 && (
                    <span className="text-xs text-text-muted flex items-center gap-1">
                      <Eye size={11} />
                      {formatNumber(item.stats.views)}
                    </span>
                  )}
                  {item.stats.likes > 0 && (
                    <span className="text-xs text-text-muted flex items-center gap-1">
                      <Heart size={11} />
                      {formatNumber(item.stats.likes)}
                    </span>
                  )}
                  {item.stats.comments > 0 && (
                    <span className="text-xs text-text-muted flex items-center gap-1">
                      <MessageCircle size={11} />
                      {formatNumber(item.stats.comments)}
                    </span>
                  )}
                  {item.stats.shares > 0 && (
                    <span className="text-xs text-text-muted flex items-center gap-1">
                      <Share2 size={11} />
                      {formatNumber(item.stats.shares)}
                    </span>
                  )}
                </div>
              )}

              {/* Watch link */}
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-accent-text hover:underline mt-2"
              >
                <ExternalLink size={11} />
                Watch original
              </a>
            </div>
          </div>
        </div>

        {/* Analysis panel rendered inline
            The VideoAnalysisPanel uses fixed positioning for modal display.
            The inline-analysis wrapper overrides that to render it as a static,
            full-width embedded panel instead of a floating modal. */}
        <div className="inline-analysis">
          <VideoAnalysisPanel
            item={item}
            onClose={handleClose}
            onReplicate={handleReplicate}
          />
        </div>

        {/* Rescript modal */}
        {replicateItem && (
          <ReplicationBriefModal
            item={replicateItem}
            clientId={null}
            onClose={() => setReplicateItem(null)}
            onSaved={(brief) => {
              setItem((prev) => prev ? { ...prev, replication_brief: brief } : prev);
              setReplicateItem(null);
            }}
          />
        )}
      </div>
    </div>
  );
}
