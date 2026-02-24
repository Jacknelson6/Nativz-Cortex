'use client';

import { memo, useState } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Globe, ExternalLink, Sparkles, Loader2, Trash2, MoreHorizontal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { MoodboardItem } from '@/lib/types/moodboard';

interface WebsiteNodeData {
  item: MoodboardItem;
  onDelete: (id: string) => void;
  onExtractInsights: (item: MoodboardItem) => void;
}

export const WebsiteNode = memo(function WebsiteNode({ data }: NodeProps<WebsiteNodeData>) {
  const { item, onDelete, onExtractInsights } = data;
  const [menuOpen, setMenuOpen] = useState(false);
  const hasInsights = !!item.page_insights;
  const isProcessing = item.status === 'processing';

  const hostname = (() => {
    try { return new URL(item.url).hostname.replace('www.', ''); } catch { return item.url; }
  })();

  return (
    <div className="bg-surface rounded-xl border border-nativz-border shadow-card overflow-hidden min-w-[280px] max-w-[360px] group">
      <Handle type="target" position={Position.Top} className="!bg-accent !border-0 !w-2 !h-2" />

      {/* Screenshot */}
      <div className="relative aspect-[16/10] bg-surface-hover overflow-hidden">
        {item.screenshot_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.screenshot_url} alt={item.title ?? hostname} className="w-full h-full object-cover object-top" />
        ) : (
          <div className="flex items-center justify-center h-full">
            {isProcessing ? (
              <Loader2 size={24} className="animate-spin text-text-muted" />
            ) : (
              <Globe size={32} className="text-text-muted/40" />
            )}
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

      {/* Content */}
      <div className="p-3 space-y-2">
        <div className="flex items-start gap-2">
          <Globe size={12} className="text-cyan-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-text-primary line-clamp-1 leading-tight">
              {item.title || hostname}
            </p>
            <p className="text-[10px] text-text-muted truncate">{hostname}</p>
          </div>
        </div>

        {/* Insights preview */}
        {hasInsights && item.page_insights && (
          <div className="space-y-1 border-t border-nativz-border pt-2">
            <p className="text-xs text-text-secondary line-clamp-2">{item.page_insights.summary}</p>
            {(item.page_insights.content_themes ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1">
                {item.page_insights.content_themes.slice(0, 3).map((tag, i) => (
                  <Badge key={i} variant="default">{tag}</Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 border-t border-nativz-border pt-2">
          {!hasInsights && (
            <button
              onClick={(e) => { e.stopPropagation(); onExtractInsights(item); }}
              className="cursor-pointer flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-purple-400 hover:bg-purple-500/10 transition-colors"
            >
              <Sparkles size={11} />
              Extract insights
            </button>
          )}
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
          >
            <ExternalLink size={11} />
            Open site
          </a>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-accent !border-0 !w-2 !h-2" />
    </div>
  );
});
