'use client';

import { memo, useState, useCallback } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Film, Play, Loader2, Eye, Copy, AlertCircle, RefreshCw, Music, MessageSquare, Trash2, MoreHorizontal, Sparkles, FileText, ClipboardList, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { MoodboardItem } from '@/lib/types/moodboard';

interface VideoNodeData {
  item: MoodboardItem;
  onViewAnalysis: (item: MoodboardItem) => void;
  onReplicate: (item: MoodboardItem) => void;
  onRescript: (item: MoodboardItem) => void;
  onDelete: (id: string) => void;
  onItemUpdate?: (item: MoodboardItem) => void;
  commentCount?: number;
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

export const VideoNode = memo(function VideoNode({ data }: NodeProps<VideoNodeData>) {
  const { item, onViewAnalysis, onReplicate, onRescript, onDelete, onItemUpdate, commentCount } = data;
  const isFailed = item.status === 'failed';
  const [reprocessing, setReprocessing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [briefing, setBriefing] = useState(false);

  const isAnalyzed = item.hook_score != null;
  const isTranscribed = !!item.transcript;
  const hasBrief = !!item.replication_brief;
  const hasRescript = !!item.rescript;

  const handleReprocess = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setReprocessing(true);
    try {
      await fetch(`/api/moodboard/items/${item.id}/reprocess`, { method: 'POST' });
    } catch { /* ignore */ }
    finally { setReprocessing(false); }
  };

  const handleAnalyze = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setAnalyzing(true);
    try {
      const res = await fetch(`/api/moodboard/items/${item.id}/analyze`, { method: 'POST' });
      if (res.ok && onItemUpdate) {
        const updated = await res.json();
        onItemUpdate(updated);
      }
    } catch { /* ignore */ }
    finally { setAnalyzing(false); }
  }, [item.id, onItemUpdate]);

  const handleTranscribe = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setTranscribing(true);
    try {
      const res = await fetch(`/api/moodboard/items/${item.id}/transcribe`, { method: 'POST' });
      if (res.ok && onItemUpdate) {
        const updated = await res.json();
        onItemUpdate(updated);
      }
    } catch { /* ignore */ }
    finally { setTranscribing(false); }
  }, [item.id, onItemUpdate]);

  const handleBrief = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setBriefing(true);
    onReplicate(item);
    setBriefing(false);
  }, [item, onReplicate]);

  return (
    <div 
      onClick={() => onViewAnalysis(item)}
      className={`bg-surface rounded-xl border border-nativz-border shadow-card overflow-hidden group cursor-pointer hover:border-accent/40 transition-colors ${
        item.platform === 'tiktok' || item.platform === 'instagram' || item.platform === 'facebook' ? 'min-w-[200px] max-w-[240px]' : 'min-w-[280px] max-w-[360px]'
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-accent !border-0 !w-2 !h-2 hover:!w-3 hover:!h-3 !transition-all" />

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
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(item.id); }}
                className="cursor-pointer flex items-center gap-2 w-full px-3 py-1.5 text-xs text-red-400 hover:bg-surface-hover transition-colors"
              >
                <Trash2 size={12} />
                Remove
              </button>
            </div>
          )}
        </div>

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
        {/* Title */}
        <div className="flex items-start gap-2">
          <Film size={12} className="text-accent-text shrink-0 mt-0.5" />
          <p className="text-xs font-semibold text-text-primary line-clamp-2 leading-tight">
            {item.title || 'Untitled video'}
          </p>
        </div>

        {/* Author */}
        {(item.author_name || item.author_handle) && (
          <p className="text-[11px] text-text-muted truncate pl-5">
            {item.author_name}{item.author_handle ? ` @${item.author_handle.replace(/^@/, '')}` : ''}
          </p>
        )}

        {/* Engagement Stats */}
        {item.stats && (
          <div className="flex items-center gap-3 text-[10px] text-text-muted pl-5">
            {item.stats.views != null && <span>👁 {formatCompactNumber(item.stats.views)}</span>}
            {item.stats.likes != null && <span>❤️ {formatCompactNumber(item.stats.likes)}</span>}
            {item.stats.comments != null && <span>💬 {formatCompactNumber(item.stats.comments)}</span>}
            {item.stats.shares != null && <span>🔗 {formatCompactNumber(item.stats.shares)}</span>}
          </div>
        )}

        {/* Music */}
        {item.music && (
          <div className="flex items-center gap-1 text-[10px] text-text-muted pl-5 truncate">
            <Music size={10} className="shrink-0" />
            <span className="truncate">{item.music}</span>
          </div>
        )}

        {/* Hook score badge + theme tags (only if analyzed) */}
        {isAnalyzed && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 pl-5">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                item.hook_score! >= 7 ? 'bg-green-500/20 text-green-400' :
                item.hook_score! >= 4 ? 'bg-yellow-500/20 text-yellow-400' :
                'bg-red-500/20 text-red-400'
              }`}>Hook {item.hook_score}/10</span>
              {item.hook_type && (
                <span className="text-[9px] text-text-muted bg-surface-hover rounded px-1">{item.hook_type}</span>
              )}
            </div>
            {(item.content_themes ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1 pl-5">
                {(item.content_themes ?? []).slice(0, 3).map((tag, i) => (
                  <Badge key={i} variant="default">{tag}</Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Failed state */}
        {isFailed && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs text-red-400">
              <AlertCircle size={12} />
              Processing failed
            </div>
            {item.error_message && (
              <p className="text-[10px] text-red-400/70 line-clamp-2 pl-5">{item.error_message}</p>
            )}
            <button
              onClick={handleReprocess}
              disabled={reprocessing}
              className="cursor-pointer flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-amber-400 hover:bg-amber-400/10 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={11} className={reprocessing ? 'animate-spin' : ''} />
              {reprocessing ? 'Reprocessing...' : 'Reprocess'}
            </button>
          </div>
        )}

        {/* On-demand action buttons */}
        {(!isAnalyzed || !isTranscribed || !hasBrief) && (
          <div className="flex flex-wrap gap-1.5 border-t border-nativz-border pt-2">
            {!isAnalyzed && (
              <button
                onClick={handleAnalyze}
                disabled={analyzing}
                className="cursor-pointer flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-accent-text hover:bg-accent-surface transition-colors disabled:opacity-50"
              >
                {analyzing ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                {analyzing ? 'Analyzing...' : 'Analyze'}
              </button>
            )}
            {!isTranscribed && (
              <button
                onClick={handleTranscribe}
                disabled={transcribing}
                className="cursor-pointer flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-accent-text hover:bg-accent-surface transition-colors disabled:opacity-50"
              >
                {transcribing ? <Loader2 size={11} className="animate-spin" /> : <FileText size={11} />}
                {transcribing ? 'Transcribing...' : 'Transcribe'}
              </button>
            )}
            {!hasBrief && (
              <button
                onClick={handleBrief}
                disabled={briefing}
                className="cursor-pointer flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-accent-text hover:bg-accent-surface transition-colors disabled:opacity-50"
              >
                {briefing ? <Loader2 size={11} className="animate-spin" /> : <ClipboardList size={11} />}
                {briefing ? 'Generating...' : 'Brief'}
              </button>
            )}
          </div>
        )}

        {/* Completed badges row */}
        {(isAnalyzed || isTranscribed || hasBrief || hasRescript) && (
          <div className="flex items-center gap-1.5 pl-5">
            {isAnalyzed && (
              <span className="flex items-center gap-0.5 text-[9px] text-green-400">
                <Check size={9} /> Analyzed
              </span>
            )}
            {isTranscribed && (
              <span className="flex items-center gap-0.5 text-[9px] text-green-400">
                <Check size={9} /> Transcript
              </span>
            )}
            {hasBrief && (
              <span className="flex items-center gap-0.5 text-[9px] text-green-400">
                <Check size={9} /> Brief
              </span>
            )}
            {hasRescript && (
              <span className="flex items-center gap-0.5 text-[9px] text-indigo-400 cursor-pointer" onClick={(e) => { e.stopPropagation(); onRescript(item); }}>
                <Check size={9} /> Rescript
              </span>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 border-t border-nativz-border pt-2">
          <button
            onClick={(e) => { e.stopPropagation(); onViewAnalysis(item); }}
            className="cursor-pointer flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
          >
            <Eye size={11} />
            Details
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onReplicate(item); }}
            className="cursor-pointer flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-accent-text hover:bg-accent-surface transition-colors"
          >
            <Copy size={11} />
            Replicate this video
          </button>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-accent !border-0 !w-2 !h-2 hover:!w-3 hover:!h-3 !transition-all" />
    </div>
  );
});
