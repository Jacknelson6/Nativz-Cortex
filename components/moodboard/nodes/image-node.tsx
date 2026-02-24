'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Image as ImageIcon, MoreHorizontal, Trash2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import type { MoodboardItem } from '@/lib/types/moodboard';

interface ImageNodeData {
  item: MoodboardItem;
  onDelete: (id: string) => void;
  onExtractInsights: (item: MoodboardItem) => void;
}

export const ImageNode = memo(function ImageNode({ data }: NodeProps<ImageNodeData>) {
  const { item, onDelete, onExtractInsights } = data;
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="bg-surface rounded-xl border border-nativz-border shadow-card overflow-hidden group min-w-[200px] max-w-[400px]">
      <Handle type="target" position={Position.Top} className="!bg-accent !border-0 !w-2 !h-2" />

      {/* Image */}
      <div className="relative">
        {item.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.url} alt={item.title ?? 'Image'} className="w-full object-cover max-h-[300px]" />
        ) : (
          <div className="aspect-video bg-surface-hover flex items-center justify-center">
            <ImageIcon size={32} className="text-text-muted/40" />
          </div>
        )}

        {/* Hover menu */}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
            className="cursor-pointer rounded-md bg-black/50 backdrop-blur-sm p-1 text-white hover:bg-black/70 transition-colors"
          >
            <MoreHorizontal size={14} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 min-w-[140px] rounded-lg border border-nativz-border bg-surface py-1 shadow-dropdown animate-fade-in">
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onExtractInsights(item); }}
                className="cursor-pointer flex items-center gap-2 w-full px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-hover transition-colors"
              >
                <Sparkles size={12} />
                Extract insights
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
      </div>

      {/* Title bar */}
      {item.title && (
        <div className="px-3 py-2">
          <p className="text-xs font-medium text-text-secondary truncate">{item.title}</p>
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!bg-accent !border-0 !w-2 !h-2" />
    </div>
  );
});
