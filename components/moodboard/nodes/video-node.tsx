'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Film, Play, Loader2, Eye, Copy, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { MoodboardItem } from '@/lib/types/moodboard';

interface VideoNodeData {
  item: MoodboardItem;
  onViewAnalysis: (item: MoodboardItem) => void;
  onReplicate: (item: MoodboardItem) => void;
}

export const VideoNode = memo(function VideoNode({ data }: NodeProps<VideoNodeData>) {
  const { item, onViewAnalysis, onReplicate } = data;
  const isProcessing = item.status === 'processing';
  const isFailed = item.status === 'failed';
  const isComplete = item.status === 'completed';

  return (
    <div className="bg-surface rounded-xl border border-nativz-border shadow-card overflow-hidden min-w-[280px] max-w-[360px] group">
      <Handle type="target" position={Position.Top} className="!bg-accent !border-0 !w-2 !h-2" />

      {/* Thumbnail */}
      <div className="relative aspect-video bg-surface-hover flex items-center justify-center overflow-hidden">
        {item.thumbnail_url ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.thumbnail_url} alt={item.title ?? 'Video'} className="w-full h-full object-cover" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="rounded-full bg-white/20 backdrop-blur-sm p-3">
                <Play size={20} className="text-white" />
              </div>
            </div>
          </>
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
        {/* Title */}
        <div className="flex items-start gap-2">
          <Film size={12} className="text-accent-text shrink-0 mt-0.5" />
          <p className="text-xs font-semibold text-text-primary line-clamp-2 leading-tight">
            {item.title || 'Untitled video'}
          </p>
        </div>

        {/* Tags */}
        {isComplete && (item.content_themes ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {(item.content_themes ?? []).slice(0, 3).map((tag, i) => (
              <Badge key={i} variant="default">{tag}</Badge>
            ))}
          </div>
        )}

        {/* Processing state */}
        {isProcessing && (
          <div className="flex items-center gap-2 text-xs text-purple-400">
            <Loader2 size={12} className="animate-spin" />
            Analyzing video...
          </div>
        )}

        {isFailed && (
          <div className="flex items-center gap-2 text-xs text-red-400">
            <AlertCircle size={12} />
            Processing failed
          </div>
        )}

        {/* Hook / CTA preview */}
        {isComplete && item.hook && (
          <div className="space-y-1 border-t border-nativz-border pt-2">
            <p className="text-[10px] font-medium text-text-muted uppercase tracking-wide">Hook</p>
            <p className="text-xs text-text-secondary line-clamp-2 italic">&ldquo;{item.hook}&rdquo;</p>
            {item.cta && (
              <>
                <p className="text-[10px] font-medium text-text-muted uppercase tracking-wide mt-1">CTA</p>
                <p className="text-xs text-text-secondary line-clamp-1">{item.cta}</p>
              </>
            )}
          </div>
        )}

        {/* Actions */}
        {isComplete && (
          <div className="flex items-center gap-2 border-t border-nativz-border pt-2">
            <button
              onClick={(e) => { e.stopPropagation(); onViewAnalysis(item); }}
              className="cursor-pointer flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
            >
              <Eye size={11} />
              View analysis
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onReplicate(item); }}
              className="cursor-pointer flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-accent-text hover:bg-accent-surface transition-colors"
            >
              <Copy size={11} />
              Replicate
            </button>
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-accent !border-0 !w-2 !h-2" />
    </div>
  );
});
