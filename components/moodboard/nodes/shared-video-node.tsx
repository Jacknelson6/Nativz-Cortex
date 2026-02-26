'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Film, Play, Eye, Music, Heart, MessageCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { MoodboardItem } from '@/lib/types/moodboard';

interface SharedVideoNodeData {
  item: MoodboardItem;
  onViewAnalysis: (item: MoodboardItem) => void;
}

function formatCompactNumber(n: number | undefined | null): string {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return n.toString();
}

function PlatformBadge({ platform }: { platform: string | null }) {
  if (!platform) return null;
  const config: Record<string, { label: string; bg: string; text: string }> = {
    tiktok: { label: 'TikTok', bg: 'bg-black', text: 'text-white' },
    youtube: { label: 'YT', bg: 'bg-red-600', text: 'text-white' },
    instagram: { label: 'IG', bg: 'bg-gradient-to-r from-purple-500 to-pink-500', text: 'text-white' },
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

export const SharedVideoNode = memo(function SharedVideoNode({ data }: NodeProps<SharedVideoNodeData>) {
  const { item, onViewAnalysis } = data;
  const isComplete = item.status === 'completed';

  return (
    <div className="bg-surface rounded-xl border border-nativz-border shadow-card overflow-hidden min-w-[280px] max-w-[360px] group">
      <Handle type="target" position={Position.Top} className="!bg-accent !border-0 !w-2 !h-2 !opacity-0" />

      {/* Thumbnail */}
      <div className="relative aspect-video bg-surface-hover flex items-center justify-center overflow-hidden">
        <PlatformBadge platform={item.platform} />
        {item.thumbnail_url ? (
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="block w-full h-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.thumbnail_url} alt={item.title ?? 'Video'} className="w-full h-full object-cover" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="rounded-full bg-white/20 backdrop-blur-sm p-3">
                <Play size={20} className="text-white" />
              </div>
            </div>
          </a>
        ) : (
          <Film size={32} className="text-text-muted/40" />
        )}
        {item.duration && (
          <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
            {Math.floor(item.duration / 60)}:{String(item.duration % 60).padStart(2, '0')}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-3 space-y-2">
        <div className="flex items-start gap-2">
          <Film size={12} className="text-accent-text shrink-0 mt-0.5" />
          <p className="text-xs font-semibold text-text-primary line-clamp-2 leading-tight">
            {item.title || 'Untitled video'}
          </p>
        </div>

        {(item.author_name || item.author_handle) && (
          <p className="text-[11px] text-text-muted truncate pl-5">
            {item.author_name}{item.author_handle ? ` @${item.author_handle.replace(/^@/, '')}` : ''}
          </p>
        )}

        {item.stats && (
          <div className="flex items-center gap-3 text-[10px] text-text-muted pl-5">
            {item.stats.views != null && <span className="flex items-center gap-0.5"><Eye size={10} /> {formatCompactNumber(item.stats.views)}</span>}
            {item.stats.likes != null && <span className="flex items-center gap-0.5"><Heart size={10} /> {formatCompactNumber(item.stats.likes)}</span>}
            {item.stats.comments != null && <span className="flex items-center gap-0.5"><MessageCircle size={10} /> {formatCompactNumber(item.stats.comments)}</span>}
          </div>
        )}

        {item.music && (
          <div className="flex items-center gap-1 text-[10px] text-text-muted pl-5 truncate">
            <Music size={10} className="shrink-0" />
            <span className="truncate">{item.music}</span>
          </div>
        )}

        {isComplete && (item.content_themes ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {(item.content_themes ?? []).slice(0, 3).map((tag, i) => (
              <Badge key={i} variant="default">{tag}</Badge>
            ))}
          </div>
        )}

        {isComplete && item.hook && (
          <div className="space-y-1 border-t border-nativz-border pt-2">
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-medium text-text-muted uppercase tracking-wide">Hook</p>
              {item.hook_score != null && (
                <span className={`text-[10px] font-bold px-1 rounded ${
                  item.hook_score >= 7 ? 'bg-green-500/20 text-green-400' :
                  item.hook_score >= 4 ? 'bg-yellow-500/20 text-yellow-400' :
                  'bg-red-500/20 text-red-400'
                }`}>{item.hook_score}/10</span>
              )}
            </div>
            <p className="text-xs text-text-secondary line-clamp-2 italic">&ldquo;{item.hook}&rdquo;</p>
          </div>
        )}

        {isComplete && (
          <div className="flex items-center gap-2 border-t border-nativz-border pt-2">
            <button
              onClick={(e) => { e.stopPropagation(); onViewAnalysis(item); }}
              className="cursor-pointer flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
            >
              <Eye size={11} />
              View analysis
            </button>
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-accent !border-0 !w-2 !h-2 !opacity-0" />
    </div>
  );
});
