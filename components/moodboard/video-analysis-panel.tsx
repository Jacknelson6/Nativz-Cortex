'use client';

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  X, Play, Copy as CopyIcon, Check, Film, Clock,
  ChevronRight, Search, Download, Quote,
  FileText, Image as ImageIcon, Target, Music, Eye, Loader2, Sparkles
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { MoodboardItem, TranscriptSegment } from '@/lib/types/moodboard';
import { PacingTimeline } from './pacing-timeline';
import { ContentBreakdown } from './content-breakdown';
import type { HookVisualAnalysis } from '@/lib/mediapipe/types';

interface VideoAnalysisPanelProps {
  item: MoodboardItem;
  onClose: () => void;
  onReplicate: (item: MoodboardItem) => void;
}

const PLATFORM_COLORS: Record<string, string> = {
  tiktok: 'bg-black text-white',
  youtube: 'bg-red-600 text-white',
  instagram: 'bg-gradient-to-r from-purple-500 to-pink-500 text-white',
  twitter: 'bg-sky-500 text-white',
};

type PanelView = 'transcript' | 'hook' | 'replicate' | 'frames';

export function VideoAnalysisPanel({ item: initialItem, onClose, onReplicate }: VideoAnalysisPanelProps) {
  const [item, setItem] = useState(initialItem);
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeFailed, setTranscribeFailed] = useState(false);
  const [extractingFrames, setExtractingFrames] = useState(false);
  const [view, setView] = useState<PanelView>('transcript');
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [view]);

  const isAnalyzed = item.hook_score != null;
  const isTranscribed = !!item.transcript;
  const framesList = item.frames ?? [];
  const hasFrames = framesList.length > 0 && new Set(framesList.map(f => f.url)).size > 1;

  const handleAnalyze = () => {
    if (isAnalyzed) {
      setView('hook');
      return;
    }
    const itemId = item.id;
    setAnalyzing(true);
    toast.info('Analyzing hook...', { duration: 3000 });

    // Fire-and-forget
    fetch(`/api/analysis/items/${itemId}/analyze`, { method: 'POST' })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(body.error || `Analysis failed (${res.status})`);
        }
        const updated = await res.json();
        setItem(updated);
        setView('hook');
        toast.success('Hook analysis ready', { duration: 5000 });
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Hook analysis failed');
      })
      .finally(() => setAnalyzing(false));
  };

  const handleExtractFrames = () => {
    const itemId = item.id;
    const itemTitle = item.title || 'Video';
    setExtractingFrames(true);
    toast.info('Extracting frames...', { duration: 3000 });

    fetch(`/api/analysis/items/${itemId}/extract-frames`, { method: 'POST' })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Frame extraction failed');
        }
        const updated = await res.json();
        setItem(updated);
        setView('frames');
        toast.success('Frames extracted', { duration: 5000 });
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Frame extraction failed');
      })
      .finally(() => setExtractingFrames(false));
  };

  const handleTranscribe = async () => {
    setTranscribing(true);
    setTranscribeFailed(false);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(`/api/analysis/items/${item.id}/transcribe`, { method: 'POST' });
        if (res.ok) {
          const updated = await res.json();
          setItem(updated);
          setTranscribing(false);
          return;
        }
      } catch { /* continue to retry */ }
    }
    // Both attempts failed
    setTranscribing(false);
    setTranscribeFailed(true);
  };

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Copied to clipboard');
  }, []);

  const platform = item.platform || 'unknown';
  const platformClass = PLATFORM_COLORS[platform] || 'bg-gray-600 text-white';

  // Auto-trigger transcription if missing
  useEffect(() => {
    if (!isTranscribed && !transcribing && item.type === 'video') {
      handleTranscribe();
    }
  }, []);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-lg max-h-[75vh] rounded-2xl border border-nativz-border bg-surface shadow-elevated overflow-hidden flex flex-col animate-fade-slide-in">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-nativz-border shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <Film size={18} className="text-accent-text shrink-0" />
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-text-primary truncate">{item.title || 'Video analysis'}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${platformClass}`}>
                    {platform}
                  </span>
                  {item.duration && (
                    <span className="text-[10px] text-text-muted flex items-center gap-1">
                      <Clock size={9} />
                      {Math.floor(item.duration / 60)}:{String(item.duration % 60).padStart(2, '0')}
                    </span>
                  )}
                  {item.stats && (
                    <span className="text-[10px] text-text-muted">
                      {formatNumber(item.stats.views)} views
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button onClick={onClose} className="cursor-pointer rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors">
              <X size={18} />
            </button>
          </div>

          {/* Watch video + Export */}
          <div className="mt-3 flex items-center gap-3">
            <a href={item.url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-accent-text hover:underline">
              <Play size={12} /> Watch video
            </a>
            <button
              onClick={() => window.open(`/api/analysis/items/${item.id}/analysis/pdf`, '_blank')}
              className="cursor-pointer inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors"
            >
              <Download size={12} /> Export PDF
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div ref={contentRef} className="flex-1 overflow-y-auto p-5">
          {view === 'transcript' && (
            <TranscriptView
              item={item}
              isTranscribed={isTranscribed}
              transcribing={transcribing}
              transcribeFailed={transcribeFailed}
              onTranscribe={handleTranscribe}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              onCopy={handleCopy}
              copied={copied}
            />
          )}

          {view === 'hook' && (
            <HookView
              item={item}
              isAnalyzed={isAnalyzed}
              analyzing={analyzing}
              onAnalyze={handleAnalyze}
            />
          )}

          {view === 'replicate' && (
            <BriefSection item={item} onReplicate={onReplicate} onCopy={handleCopy} copied={copied} />
          )}

          {view === 'frames' && (
            <FramesSection item={item} extracting={extractingFrames} onExtract={handleExtractFrames} />
          )}
        </div>

        {/* Pinned bottom buttons */}
        {(isTranscribed || transcribeFailed) && (
          <div className="shrink-0 border-t border-nativz-border px-5 py-3">
            <div className="grid grid-cols-4 gap-2">
              {([
                { key: 'transcript' as PanelView, icon: <FileText size={14} className="shrink-0" />, label: 'Transcript', onClick: () => setView('transcript'), disabled: false },
                { key: 'hook' as PanelView, icon: analyzing ? <Loader2 size={14} className="shrink-0 animate-spin" /> : <Target size={14} className="shrink-0" />, label: 'Hook', onClick: () => { setView('hook'); if (!isAnalyzed && !analyzing) handleAnalyze(); }, disabled: false },
                { key: 'replicate' as PanelView, icon: <Sparkles size={14} className="shrink-0" />, label: 'Rescript', onClick: () => setView('replicate'), disabled: false },
                { key: 'frames' as PanelView, icon: extractingFrames ? <Loader2 size={14} className="shrink-0 animate-spin" /> : <ImageIcon size={14} className="shrink-0" />, label: 'Frames', onClick: () => setView('frames'), disabled: false },
              ]).map((btn) => (
                <button
                  key={btn.key}
                  onClick={btn.onClick}
                  disabled={btn.disabled}
                  className={`cursor-pointer flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium border transition-colors duration-150 hover:scale-[1.02] active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none focus:outline-none ${
                    view === btn.key
                      ? 'bg-surface-hover text-text-primary border-transparent'
                      : 'border-nativz-border text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                  }`}
                >
                  {btn.icon}
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      </div>
    </>
  );
}

// ─── Transcript View ─────────────────────────────────────────
function TranscriptView({ item, isTranscribed, transcribing, transcribeFailed, onTranscribe, searchQuery, setSearchQuery, onCopy, copied }: {
  item: MoodboardItem; isTranscribed: boolean; transcribing: boolean; transcribeFailed: boolean; onTranscribe: () => void;
  searchQuery: string; setSearchQuery: (q: string) => void; onCopy: (t: string) => void; copied: boolean;
}) {
  if (!isTranscribed) {
    return (
      <div className="text-center py-12">
        {transcribing ? (
          <>
            <Loader2 size={24} className="animate-spin text-accent-text mx-auto mb-3" />
            <p className="text-sm text-text-muted">Transcribing video...</p>
          </>
        ) : transcribeFailed ? (
          <>
            <FileText size={24} className="text-text-muted/40 mx-auto mb-3" />
            <p className="text-sm text-text-muted">This video could not be transcribed</p>
          </>
        ) : (
          <>
            <FileText size={24} className="text-text-muted mx-auto mb-3" />
            <p className="text-sm text-text-muted mb-3">Extract the video transcript</p>
            <Button onClick={onTranscribe}>
              <FileText size={14} />
              Transcribe
            </Button>
          </>
        )}
      </div>
    );
  }

  return <TranscriptSection item={item} searchQuery={searchQuery} setSearchQuery={setSearchQuery} onCopy={onCopy} copied={copied} />;
}

// ─── Hook View ───────────────────────────────────────────────
function HookView({ item, isAnalyzed, analyzing, onAnalyze }: {
  item: MoodboardItem; isAnalyzed: boolean; analyzing: boolean; onAnalyze: () => void;
}) {
  if (!isAnalyzed && !item.hook) {
    return (
      <div className="text-center py-12">
        {analyzing ? (
          <>
            <Loader2 size={24} className="animate-spin text-accent-text mx-auto mb-3" />
            <p className="text-sm text-text-muted">Analyzing hook...</p>
            <p className="text-xs text-text-muted mt-1">You can switch tabs while this runs</p>
          </>
        ) : (
          <>
            <Target size={24} className="text-text-muted mx-auto mb-3" />
            <p className="text-sm text-text-muted mb-3">Run analysis to see hook breakdown</p>
            <Button onClick={onAnalyze} className="cursor-pointer">
              <Sparkles size={14} />
              Analyze
            </Button>
          </>
        )}
      </div>
    );
  }

  const formatTag = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());

  return (
    <div className="space-y-4 overflow-y-auto">
      {/* Hook quote */}
      {item.hook && (
        <div className="rounded-xl border border-accent/20 bg-accent-surface p-4">
          <Quote size={16} className="text-accent-text mb-1.5 opacity-50" />
          <p className="text-base text-text-primary font-medium italic leading-relaxed">
            &ldquo;{item.hook}&rdquo;
          </p>
        </div>
      )}

      {/* Score + type row */}
      {item.hook_score != null && (
        <div className="rounded-lg border border-nativz-border bg-surface-hover/30 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-text-muted uppercase tracking-wide">Hook score</span>
              {item.hook_type && (
                <Badge variant="info" className="text-[10px]">{formatTag(item.hook_type)}</Badge>
              )}
              {item.mediapipe_analysis?.hook && item.mediapipe_analysis.hook.visualHookType !== 'unknown' && (
                <span className="text-[10px] bg-white/5 rounded-full px-2 py-0.5 text-text-muted">
                  {formatTag(item.mediapipe_analysis.hook.visualHookType)}
                </span>
              )}
            </div>
            <span className="text-2xl font-bold text-accent-text">{item.hook_score}<span className="text-sm text-text-muted">/10</span></span>
          </div>
          <HookScoreBar score={item.hook_score} />
        </div>
      )}

      {/* Why it works */}
      {item.hook_analysis && (
        <div>
          <p className="text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1">Why it works</p>
          <p className="text-sm text-text-secondary leading-relaxed">{item.hook_analysis}</p>
        </div>
      )}

      {/* Summary */}
      {item.concept_summary && (
        <div>
          <p className="text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1">Summary</p>
          <p className="text-sm text-text-secondary">{item.concept_summary}</p>
        </div>
      )}

      {/* Themes */}
      {(item.content_themes ?? []).length > 0 && (
        <div>
          <p className="text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1.5">Themes</p>
          <div className="flex flex-wrap gap-1.5">
            {item.content_themes.map((tag, i) => (
              <span key={i} className="text-[11px] bg-white/5 rounded-full px-2.5 py-0.5 text-text-secondary">
                {formatTag(tag)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* What works */}
      {(item.winning_elements ?? []).length > 0 && (
        <div>
          <p className="text-[10px] font-medium text-text-muted uppercase tracking-wide mb-2">What works</p>
          <div className="space-y-1">
            {item.winning_elements.map((el, i) => (
              <div key={i} className="flex gap-2 text-sm text-text-secondary">
                <span className="text-emerald-400 shrink-0 mt-0.5">+</span>
                <span>{el}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Improvement areas */}
      {(item.improvement_areas ?? []).length > 0 && (
        <div>
          <p className="text-[10px] font-medium text-text-muted uppercase tracking-wide mb-2">Could improve</p>
          <div className="space-y-1">
            {item.improvement_areas.map((el, i) => (
              <div key={i} className="flex gap-2 text-sm text-text-secondary">
                <span className="text-amber-400 shrink-0 mt-0.5">-</span>
                <span>{el}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pacing */}
      {item.mediapipe_analysis?.pacing && (
        <div className="rounded-lg border border-nativz-border bg-surface-hover/30 p-3">
          <p className="text-[10px] font-medium text-text-muted uppercase tracking-wide mb-2">Pacing</p>
          <PacingTimeline
            pacing={item.mediapipe_analysis.pacing}
            videoDurationMs={(item.duration ?? 30) * 1000}
          />
        </div>
      )}
    </div>
  );
}

// ─── Transcript Section ─────────────────────────────────────
function TranscriptSection({ item, searchQuery, setSearchQuery, onCopy, copied }: {
  item: MoodboardItem; searchQuery: string; setSearchQuery: (q: string) => void; onCopy: (t: string) => void; copied: boolean;
}) {
  const segments: TranscriptSegment[] = item.transcript_segments ?? [];
  const hasSegments = segments.length > 0;

  const filteredSegments = useMemo(() => {
    if (!searchQuery.trim()) return segments;
    const q = searchQuery.toLowerCase();
    return segments.filter(s => s.text.toLowerCase().includes(q));
  }, [segments, searchQuery]);

  const highlightedTranscript = useMemo(() => {
    if (!item.transcript || !searchQuery.trim()) return null;
    const q = searchQuery.trim();
    if (!q) return null;
    const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return item.transcript.replace(regex, '<<<HIGHLIGHT>>>$1<<<ENDHIGHLIGHT>>>');
  }, [item.transcript, searchQuery]);

  if (!item.transcript && !hasSegments) {
    return <p className="text-sm text-text-muted text-center py-4">No transcript available</p>;
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          placeholder="Search transcript..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-nativz-border bg-surface-hover/30 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
        />
      </div>

      {item.hook && (
        <div className="rounded-lg border border-accent/20 bg-accent-surface p-3">
          <p className="text-[10px] font-medium text-accent-text uppercase tracking-wide mb-1">Hook</p>
          <p className="text-sm text-text-primary italic">&ldquo;{item.hook}&rdquo;</p>
        </div>
      )}

      {hasSegments ? (
        <div className="space-y-1 overflow-y-auto">
          {filteredSegments.map((seg, i) => (
            <div key={i} className="flex gap-2 rounded p-1.5 hover:bg-surface-hover/50 transition-colors">
              <span className="text-[10px] text-accent-text font-mono shrink-0 pt-0.5 w-10 text-right">
                {formatTimestamp(seg.start)}
              </span>
              <p className="text-sm text-text-secondary">
                {searchQuery ? highlightText(seg.text, searchQuery) : seg.text}
              </p>
            </div>
          ))}
          {filteredSegments.length === 0 && searchQuery && (
            <p className="text-sm text-text-muted text-center py-4">No matches found</p>
          )}
        </div>
      ) : item.transcript ? (
        <div className="rounded-lg border border-nativz-border bg-surface-hover/30 p-4 text-sm text-text-secondary whitespace-pre-wrap overflow-y-auto">
          {highlightedTranscript ? renderHighlighted(highlightedTranscript) : item.transcript}
        </div>
      ) : null}

      {item.transcript && (
        <button onClick={() => onCopy(item.transcript!)}
          className="cursor-pointer flex items-center gap-1 text-[10px] text-text-muted hover:text-accent-text transition-colors">
          {copied ? <Check size={10} /> : <CopyIcon size={10} />}
          Copy transcript
        </button>
      )}

      {item.cta && (
        <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-3">
          <p className="text-[10px] font-medium text-orange-400 uppercase tracking-wide mb-1">Call to action</p>
          <p className="text-sm text-text-primary">{item.cta}</p>
        </div>
      )}
    </div>
  );
}

// ─── Frames Section ─────────────────────────────────────────

/** Find the transcript text that overlaps a given timestamp */
function getTranscriptAtTimestamp(segments: TranscriptSegment[], timestamp: number, intervalSec: number): string {
  if (segments.length === 0) return '';
  const endTs = timestamp + intervalSec;
  const matching = segments.filter(s => s.start < endTs && s.end > timestamp);
  if (matching.length > 0) return matching.map(s => s.text).join(' ');
  // Fallback: find nearest segment
  const nearest = segments.reduce((prev, curr) =>
    Math.abs(curr.start - timestamp) < Math.abs(prev.start - timestamp) ? curr : prev
  );
  return nearest.text;
}

function FramesSection({ item, extracting, onExtract }: {
  item: MoodboardItem;
  extracting: boolean; onExtract: () => void;
}) {
  const frames = item.frames ?? [];
  const segments: TranscriptSegment[] = item.transcript_segments ?? [];
  const hasDistinctFrames = new Set(frames.map(f => f.url)).size > 1;

  if (frames.length === 0 || !hasDistinctFrames) {
    return (
      <div className="text-center py-12">
        {extracting ? (
          <>
            <Loader2 size={24} className="animate-spin text-accent-text mx-auto mb-3" />
            <p className="text-sm text-text-muted">Extracting frames...</p>
            <p className="text-xs text-text-muted mt-1">You can switch tabs while this runs</p>
          </>
        ) : (
          <>
            <ImageIcon size={24} className="text-text-muted mx-auto mb-3" />
            <p className="text-sm text-text-muted mb-3">Extract key frames from this video</p>
            <Button onClick={onExtract} className="cursor-pointer">
              <ImageIcon size={14} />
              Extract frames
            </Button>
          </>
        )}
      </div>
    );
  }

  const contentClassification = item.mediapipe_analysis?.contentClassification;

  return (
    <div className="space-y-3 overflow-y-auto">
      {contentClassification && (
        <div className="rounded-lg border border-nativz-border bg-surface-hover/20 p-3">
          <ContentBreakdown
            classification={contentClassification}
            videoDurationMs={(item.duration ?? 30) * 1000}
          />
        </div>
      )}
      {frames.map((frame, i) => {
        const transcriptText = segments.length > 0
          ? getTranscriptAtTimestamp(segments, frame.timestamp, 3)
          : '';

        return (
          <div key={i} className="flex gap-3 rounded-lg border border-nativz-border bg-surface-hover/20 p-2 hover:border-accent/30 transition-colors">
            {/* 9:16 frame preview */}
            <div className="relative shrink-0 w-[72px] rounded-md overflow-hidden border border-nativz-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={frame.url}
                alt={frame.label}
                className="w-full aspect-[9/16] object-cover"
              />
              <div className="absolute bottom-0 inset-x-0 bg-black/70 text-white text-[9px] font-mono text-center py-0.5">
                {frame.label}
              </div>
            </div>

            {/* Transcript text */}
            <div className="flex-1 min-w-0 py-0.5">
              <p className="text-[10px] font-medium text-text-muted mb-1">
                {frame.label}{i < frames.length - 1 ? ` – ${frames[i + 1].label}` : '+'}
              </p>
              {transcriptText ? (
                <p className="text-sm text-text-secondary leading-relaxed">
                  {transcriptText}
                </p>
              ) : (
                <p className="text-xs text-text-muted italic">No transcript at this point</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Brief Section ──────────────────────────────────────────
function BriefSection({ item, onReplicate, onCopy, copied }: {
  item: MoodboardItem; onReplicate: (item: MoodboardItem) => void; onCopy: (t: string) => void; copied: boolean;
}) {
  const handleDownloadPDF = () => {
    window.open(`/api/analysis/items/${item.id}/brief/pdf`, '_blank');
  };

  if (!item.replication_brief) {
    return (
      <div className="text-center py-12">
        <Sparkles size={24} className="text-text-muted mx-auto mb-3" />
        <p className="text-sm text-text-muted mb-3">No rescript generated yet</p>
        <Button onClick={() => onReplicate(item)} className="cursor-pointer">
          <CopyIcon size={14} />
          Rescript
          <ChevronRight size={14} />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={() => onCopy(item.replication_brief!)}
          className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-nativz-border text-xs text-text-muted hover:text-text-secondary hover:bg-surface-hover transition-colors">
          {copied ? <Check size={12} /> : <CopyIcon size={12} />}
          Copy
        </button>
        <button onClick={handleDownloadPDF}
          className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-nativz-border text-xs text-text-muted hover:text-text-secondary hover:bg-surface-hover transition-colors">
          <Download size={12} />
          Export PDF
        </button>
        <button onClick={() => onReplicate(item)}
          className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-accent/30 text-xs text-accent-text hover:bg-accent/10 transition-colors ml-auto">
          Regenerate
        </button>
      </div>

      <div className="rounded-lg border border-nativz-border bg-surface-hover/20 p-4 text-sm text-text-secondary whitespace-pre-wrap leading-relaxed overflow-y-auto">
        {item.replication_brief}
      </div>
    </div>
  );
}

// ─── Visual Hook Metrics ─────────────────────────────────────
function VisualHookMetrics({ hook }: { hook: HookVisualAnalysis }) {
  const metrics = [
    { label: 'Face prominence', value: hook.faceProminence, color: 'bg-blue-400' },
    { label: 'Movement energy', value: hook.movementEnergy, color: 'bg-amber-400' },
    { label: 'Visual complexity', value: hook.visualComplexity, color: 'bg-purple-400' },
  ].filter((m) => m.value > 0);

  if (metrics.length === 0 && hook.objectsDetected.length === 0) return null;

  return (
    <div className="space-y-2">
      {metrics.length > 0 && (
        <div className="space-y-1.5">
          {metrics.map((m) => (
            <div key={m.label} className="flex items-center gap-2">
              <span className="text-[10px] text-text-muted w-28 shrink-0">{m.label}</span>
              <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div
                  className={`h-full rounded-full ${m.color}`}
                  style={{ width: `${Math.round(m.value * 100)}%` }}
                />
              </div>
              <span className="text-[10px] text-text-muted w-8 text-right">{Math.round(m.value * 100)}%</span>
            </div>
          ))}
        </div>
      )}
      {hook.objectsDetected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {hook.objectsDetected.slice(0, 5).map((obj, i) => (
            <span key={i} className="text-[10px] bg-white/5 rounded-full px-2 py-0.5 text-text-muted">
              {obj}
            </span>
          ))}
          {hook.objectsDetected.length > 5 && (
            <span className="text-[10px] text-text-muted">+{hook.objectsDetected.length - 5} more</span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Shared Components ──────────────────────────────────────
function HookScoreBar({ score }: { score: number }) {
  const pct = (score / 10) * 100;
  const color = score >= 7 ? 'bg-emerald-500' : score >= 4 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="h-2 rounded-full bg-surface-hover border border-nativz-border overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─── Utilities ──────────────────────────────────────────────
function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? <mark key={i} className="bg-yellow-400/30 text-text-primary rounded px-0.5">{part}</mark> : part
  );
}

function renderHighlighted(text: string): React.ReactNode {
  const parts = text.split(/(<<<HIGHLIGHT>>>|<<<ENDHIGHLIGHT>>>)/);
  let inHighlight = false;
  return parts.map((part, i) => {
    if (part === '<<<HIGHLIGHT>>>') { inHighlight = true; return null; }
    if (part === '<<<ENDHIGHLIGHT>>>') { inHighlight = false; return null; }
    return inHighlight
      ? <mark key={i} className="bg-yellow-400/30 text-text-primary rounded px-0.5">{part}</mark>
      : part;
  });
}
