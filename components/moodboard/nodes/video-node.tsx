'use client';

import { memo, useState } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Film, Play, AlertCircle, RefreshCw, MessageSquare, Trash2, MoreHorizontal, Eye, Link } from 'lucide-react';
import { toast } from 'sonner';
import type { MoodboardItem } from '@/lib/types/moodboard';

interface MediaPipeProgress {
  stage: string;
  percent: number;
}

interface VideoNodeData {
  item: MoodboardItem;
  onViewAnalysis: (item: MoodboardItem) => void;
  onDelete: (id: string) => void;
  onItemUpdate?: (item: MoodboardItem) => void;
  commentCount?: number;
  mediapipeProgress?: MediaPipeProgress | null;
}

function formatCompactNumber(n: number | undefined | null): string {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return n.toString();
}

function erColor(rate: number): string {
  if (rate >= 5) return 'text-emerald-400 bg-emerald-400/10';
  if (rate >= 3) return 'text-sky-400 bg-sky-400/10';
  if (rate >= 1) return 'text-blue-400 bg-blue-400/10';
  return 'text-text-muted bg-white/5';
}

function PlatformBadge({ platform }: { platform: string | null }) {
  if (!platform) return null;
  const config: Record<string, { label: string; bg: string; text: string }> = {
    tiktok: { label: 'TikTok', bg: 'bg-black', text: 'text-white' },
    youtube: { label: 'YT', bg: 'bg-red-600', text: 'text-white' },
    instagram: { label: 'IG', bg: 'bg-gradient-to-r from-purple-500 to-pink-500', text: 'text-white' },
    facebook: { label: 'FB', bg: 'bg-blue-600', text: 'text-white' },
    twitter: { label: '𝕏', bg: 'bg-black', text: 'text-white' },
  };
  const c = config[platform];
  if (!c) return null;
  return (
    <span className={`absolute top-2 left-2 z-10 rounded px-1.5 py-0.5 text-[10px] font-bold ${c.bg} ${c.text} shadow-md`}>
      {c.label}
    </span>
  );
}

function stageLabel(stage: string): string {
  switch (stage) {
    case 'loading_models': return 'Loading models...';
    case 'extracting_frames': return 'Extracting frames...';
    case 'analyzing': return 'Analyzing video...';
    case 'complete': return 'Complete';
    default: return 'Processing...';
  }
}

export const VideoNode = memo(function VideoNode({ data }: NodeProps<VideoNodeData>) {
  const { item, onViewAnalysis, onDelete, commentCount, mediapipeProgress } = data;
  const isFailed = item.status === 'failed';
  const [reprocessing, setReprocessing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleReprocess = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setReprocessing(true);
    try {
      await fetch(`/api/analysis/items/${item.id}/reprocess`, { method: 'POST' });
    } catch { /* ignore */ }
    finally { setReprocessing(false); }
  };

  return (
    <div
      onClick={() => onViewAnalysis(item)}
      className={`bg-surface rounded-xl border border-nativz-border shadow-card overflow-hidden group cursor-pointer hover:border-accent/40 transition-colors ${
        item.platform === 'tiktok' || item.platform === 'instagram' || item.platform === 'facebook' ? 'min-w-[200px] max-w-[240px]' : 'min-w-[280px] max-w-[360px]'
      }`}
    >
      <Handle type="target" position={Position.Top} id="top-target" className="!bg-accent !border-0 !w-2 !h-2 hover:!w-3 hover:!h-3 !transition-all !opacity-0 group-hover:!opacity-100" />
      <Handle type="source" position={Position.Top} id="top-source" className="!bg-accent !border-0 !w-2 !h-2 hover:!w-3 hover:!h-3 !transition-all !opacity-0 group-hover:!opacity-100" />
      <Handle type="target" position={Position.Left} id="left-target" className="!bg-accent !border-0 !w-2 !h-2 hover:!w-3 hover:!h-3 !transition-all !opacity-0 group-hover:!opacity-100" />
      <Handle type="source" position={Position.Left} id="left-source" className="!bg-accent !border-0 !w-2 !h-2 hover:!w-3 hover:!h-3 !transition-all !opacity-0 group-hover:!opacity-100" />
      <Handle type="target" position={Position.Right} id="right-target" className="!bg-accent !border-0 !w-2 !h-2 hover:!w-3 hover:!h-3 !transition-all !opacity-0 group-hover:!opacity-100" />
      <Handle type="source" position={Position.Right} id="right-source" className="!bg-accent !border-0 !w-2 !h-2 hover:!w-3 hover:!h-3 !transition-all !opacity-0 group-hover:!opacity-100" />

      {/* Thumbnail */}
      <div className={`relative bg-surface-hover flex items-center justify-center overflow-hidden ${
        item.platform === 'tiktok' || item.platform === 'instagram' || item.platform === 'facebook' ? 'aspect-[9/16]' : 'aspect-video'
      }`}>
        <PlatformBadge platform={item.platform} />

        {/* Comment count badge */}
        {(commentCount ?? 0) > 0 && (
          <span className="absolute top-2 right-10 z-10 flex items-center gap-0.5 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-white shadow-md">
            <MessageSquare size={10} />
            {commentCount}
          </span>
        )}

        {/* Hover menu */}
        <div className="absolute top-2 right-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
            className="cursor-pointer rounded-md bg-black/50 backdrop-blur-sm p-1 text-white hover:bg-black/70 transition-colors"
          >
            <MoreHorizontal size={14} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 min-w-[140px] rounded-lg border border-nativz-border bg-surface py-1 shadow-dropdown animate-fade-in">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  if (item.url) {
                    navigator.clipboard.writeText(item.url);
                    toast.success('Link copied');
                  }
                }}
                className="cursor-pointer flex items-center gap-2 w-full px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-hover transition-colors"
              >
                <Link size={12} />
                Copy link
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(item.id); }}
                className="cursor-pointer flex items-center gap-2 w-full px-3 py-1.5 text-xs text-red-400 hover:bg-surface-hover transition-colors"
              >
                <Trash2 size={12} />
                Remove
              </button>
            </div>
          )}
        </div>

        {(item.thumbnail_candidates?.selectedUrl || item.thumbnail_url) ? (
          <div className="w-full h-full relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.thumbnail_candidates?.selectedUrl || item.thumbnail_url!} alt={item.title ?? 'Video'} className="w-full h-full object-cover transition-opacity duration-200" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="cursor-pointer rounded-full bg-white/20 backdrop-blur-sm p-3 hover:bg-white/30 transition-colors"
              >
                <Play size={20} className="text-white" />
              </a>
            </div>
          </div>
        ) : (
          <Film size={32} className="text-text-muted/40" />
        )}
        {item.duration && (
          <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
            {Math.floor(item.duration / 60)}:{String(item.duration % 60).padStart(2, '0')}
          </span>
        )}

        {/* MediaPipe progress indicator */}
        {mediapipeProgress && (
          <div className="absolute bottom-0 left-0 right-0 pointer-events-none" aria-live="polite" aria-label={`MediaPipe analysis: ${stageLabel(mediapipeProgress.stage)} ${Math.round(mediapipeProgress.percent * 100)}%`}>
            <div className="px-2 pb-1.5">
              <span className="text-[9px] text-white/80 drop-shadow-sm">
                {stageLabel(mediapipeProgress.stage)} {Math.round(mediapipeProgress.percent * 100)}%
              </span>
            </div>
            <div className="h-1 bg-white/10">
              <div
                className="h-full bg-accent transition-all duration-300 ease-out"
                style={{ width: `${Math.round(mediapipeProgress.percent * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3 space-y-2">
        {/* Headline — prefer AI concept summary over raw caption */}
        <p className="text-xs font-semibold text-text-primary line-clamp-2 leading-tight text-center">
          {item.concept_summary || item.title || 'Untitled video'}
        </p>

        {/* Stats */}
        {item.stats && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-center gap-3 text-[10px] text-text-muted">
              {item.stats.views != null && <span>{formatCompactNumber(item.stats.views)} views</span>}
              {item.stats.likes != null && <span>{formatCompactNumber(item.stats.likes)} likes</span>}
              {item.stats.shares != null && <span>{formatCompactNumber(item.stats.shares)} shares</span>}
            </div>
            <div className="flex items-center justify-center gap-1.5 flex-wrap">
              {item.stats.views != null && item.stats.likes != null && item.stats.views > 0 && (() => {
                const rate = (item.stats!.likes! / item.stats!.views!) * 100;
                return (
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${erColor(rate)}`}>
                    ER {rate.toFixed(1)}%
                  </span>
                );
              })()}
              {item.content_themes?.[0] && (
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-white/5 text-text-muted border border-nativz-border">
                  {item.content_themes[0].replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Failed state */}
        {isFailed && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-center gap-2 text-xs text-red-400">
              <AlertCircle size={12} />
              Processing failed
            </div>
            {item.error_message && (
              <p className="text-[10px] text-red-400/70 line-clamp-2 text-center">{item.error_message}</p>
            )}
            <div className="flex justify-center">
              <button
                onClick={handleReprocess}
                disabled={reprocessing}
                className="cursor-pointer flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-amber-400 hover:bg-amber-400/10 transition-colors disabled:opacity-50"
              >
                <RefreshCw size={11} className={reprocessing ? 'animate-spin' : ''} />
                {reprocessing ? 'Reprocessing...' : 'Reprocess'}
              </button>
            </div>
          </div>
        )}

        {/* Details button */}
        <div className="flex justify-center border-t border-nativz-border pt-2">
          <button
            onClick={(e) => { e.stopPropagation(); onViewAnalysis(item); }}
            className="cursor-pointer flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-all duration-150 hover:scale-[1.02] active:scale-[0.97]"
          >
            <Eye size={12} />
            Details
          </button>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} id="bottom-source" className="!bg-accent !border-0 !w-2 !h-2 hover:!w-3 hover:!h-3 !transition-all !opacity-0 group-hover:!opacity-100" />
      <Handle type="target" position={Position.Bottom} id="bottom-target" className="!bg-accent !border-0 !w-2 !h-2 hover:!w-3 hover:!h-3 !transition-all !opacity-0 group-hover:!opacity-100" />
    </div>
  );
});
