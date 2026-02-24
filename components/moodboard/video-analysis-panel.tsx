'use client';

import React, { useState, useMemo, useCallback } from 'react';
import {
  X, Play, Copy as CopyIcon, Check, Film, Clock, Scissors, Zap,
  AlertTriangle, ChevronRight, Search, Download, Quote, Gauge,
  FileText, Image as ImageIcon, Target, Music, Eye
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { MoodboardItem, TranscriptSegment, VideoPacingDetail } from '@/lib/types/moodboard';

interface VideoAnalysisPanelProps {
  item: MoodboardItem;
  onClose: () => void;
  onReplicate: (item: MoodboardItem) => void;
}

type Tab = 'overview' | 'transcript' | 'frames' | 'hook' | 'pacing' | 'brief';

const PLATFORM_COLORS: Record<string, string> = {
  tiktok: 'bg-black text-white',
  youtube: 'bg-red-600 text-white',
  instagram: 'bg-gradient-to-r from-purple-500 to-pink-500 text-white',
  twitter: 'bg-sky-500 text-white',
};

export function VideoAnalysisPanel({ item, onClose, onReplicate }: VideoAnalysisPanelProps) {
  const [tab, setTab] = useState<Tab>('overview');
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFrame, setExpandedFrame] = useState<number | null>(null);

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Copied to clipboard');
  }, []);

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <Eye size={12} /> },
    { id: 'transcript', label: 'Transcript', icon: <FileText size={12} /> },
    { id: 'frames', label: 'Frames', icon: <ImageIcon size={12} /> },
    { id: 'hook', label: 'Hook', icon: <Target size={12} /> },
    { id: 'pacing', label: 'Pacing', icon: <Gauge size={12} /> },
    { id: 'brief', label: 'Brief', icon: <CopyIcon size={12} /> },
  ];

  const platform = item.platform || 'unknown';
  const platformClass = PLATFORM_COLORS[platform] || 'bg-gray-600 text-white';

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 z-50 h-full w-[480px] border-l border-nativz-border bg-surface shadow-elevated overflow-hidden flex flex-col animate-fade-slide-in">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-nativz-border shrink-0">
          <div className="flex items-start justify-between mb-3">
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

          {/* Tabs as pills */}
          <div className="flex gap-1 flex-wrap">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`cursor-pointer flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium transition-colors ${
                  tab === t.id
                    ? 'bg-accent/20 text-accent-text'
                    : 'text-text-muted hover:bg-surface-hover hover:text-text-secondary'
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'overview' && (
            <OverviewTab item={item} onReplicate={onReplicate} onCopy={handleCopy} />
          )}
          {tab === 'transcript' && (
            <TranscriptTab item={item} searchQuery={searchQuery} setSearchQuery={setSearchQuery} onCopy={handleCopy} copied={copied} />
          )}
          {tab === 'frames' && (
            <FramesTab item={item} expandedFrame={expandedFrame} setExpandedFrame={setExpandedFrame} />
          )}
          {tab === 'hook' && (
            <HookTab item={item} />
          )}
          {tab === 'pacing' && (
            <PacingTab item={item} />
          )}
          {tab === 'brief' && (
            <BriefTab item={item} onReplicate={onReplicate} onCopy={handleCopy} copied={copied} />
          )}
        </div>
      </div>
    </>
  );
}

// ─── Overview Tab ───────────────────────────────────────────
function OverviewTab({ item, onReplicate, onCopy }: { item: MoodboardItem; onReplicate: (item: MoodboardItem) => void; onCopy: (text: string) => void }) {
  return (
    <div className="space-y-4 animate-fade-in">
      {/* Thumbnail */}
      <div className="aspect-video rounded-lg bg-surface-hover flex items-center justify-center overflow-hidden">
        {item.thumbnail_url ? (
          <div className="relative w-full h-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.thumbnail_url} alt="" className="w-full h-full object-cover" />
            <a href={item.url} target="_blank" rel="noopener noreferrer"
              className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors">
              <div className="rounded-full bg-white/20 backdrop-blur-sm p-4">
                <Play size={24} className="text-white" />
              </div>
            </a>
          </div>
        ) : (
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-accent-text text-sm hover:underline">
            <Play size={16} /> Watch video
          </a>
        )}
      </div>

      {/* Concept summary */}
      {item.concept_summary && (
        <Section title="Summary">
          <p className="text-sm text-text-secondary">{item.concept_summary}</p>
        </Section>
      )}

      {/* Engagement stats */}
      {item.stats && (
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'Views', value: item.stats.views },
            { label: 'Likes', value: item.stats.likes },
            { label: 'Comments', value: item.stats.comments },
            { label: 'Shares', value: item.stats.shares },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-nativz-border bg-surface-hover/30 p-2 text-center">
              <p className="text-base font-bold text-text-primary">{formatNumber(s.value)}</p>
              <p className="text-[9px] text-text-muted">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Content themes */}
      {(item.content_themes ?? []).length > 0 && (
        <Section title="Themes">
          <div className="flex flex-wrap gap-1.5">
            {item.content_themes.map((tag, i) => (
              <Badge key={i} variant="info">{tag}</Badge>
            ))}
          </div>
        </Section>
      )}

      {/* Winning elements */}
      {(item.winning_elements ?? []).length > 0 && (
        <Section title="What works" icon={<Check size={12} className="text-emerald-400" />}>
          <ul className="space-y-1.5">
            {item.winning_elements.map((el, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                <Check size={12} className="text-emerald-400 shrink-0 mt-0.5" />
                {el}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Improvement areas */}
      {(item.improvement_areas ?? []).length > 0 && (
        <Section title="Could improve" icon={<AlertTriangle size={12} className="text-yellow-400" />}>
          <ul className="space-y-1.5">
            {item.improvement_areas.map((el, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                <AlertTriangle size={12} className="text-yellow-400 shrink-0 mt-0.5" />
                {el}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Hook score preview */}
      {item.hook_score && (
        <div className="flex items-center gap-3 rounded-lg border border-nativz-border bg-surface-hover/30 p-3">
          <div className="text-center">
            <p className="text-2xl font-bold text-accent-text">{item.hook_score}</p>
            <p className="text-[9px] text-text-muted">Hook Score</p>
          </div>
          <div className="flex-1">
            <HookScoreBar score={item.hook_score} />
          </div>
          {item.hook_type && (
            <Badge variant="info">{item.hook_type}</Badge>
          )}
        </div>
      )}

      {/* Copy summary */}
      {item.concept_summary && (
        <button onClick={() => onCopy(item.concept_summary!)}
          className="cursor-pointer text-[10px] text-text-muted hover:text-accent-text transition-colors">
          Copy summary
        </button>
      )}

      {/* Replicate CTA */}
      <div className="pt-3 border-t border-nativz-border">
        <Button onClick={() => onReplicate(item)} className="w-full justify-center">
          <CopyIcon size={14} />
          Generate replication brief
          <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}

// ─── Transcript Tab ─────────────────────────────────────────
function TranscriptTab({ item, searchQuery, setSearchQuery, onCopy, copied }: {
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

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Search */}
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

      {/* Hook highlight */}
      {item.hook && (
        <div className="rounded-lg border border-accent/20 bg-accent-surface p-3">
          <p className="text-[10px] font-medium text-accent-text uppercase tracking-wide mb-1">Hook</p>
          <p className="text-sm text-text-primary italic">&ldquo;{item.hook}&rdquo;</p>
        </div>
      )}

      {/* Transcript body */}
      {hasSegments ? (
        <div className="space-y-1 max-h-[500px] overflow-y-auto">
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
        <div className="relative">
          <div className="rounded-lg border border-nativz-border bg-surface-hover/30 p-4 text-sm text-text-secondary whitespace-pre-wrap max-h-[500px] overflow-y-auto">
            {highlightedTranscript
              ? renderHighlighted(highlightedTranscript)
              : item.transcript}
          </div>
        </div>
      ) : (
        <p className="text-sm text-text-muted text-center py-8">No transcript available</p>
      )}

      {/* Copy + CTA */}
      {item.transcript && (
        <div className="flex items-center gap-2">
          <button onClick={() => onCopy(item.transcript!)}
            className="cursor-pointer flex items-center gap-1 text-[10px] text-text-muted hover:text-accent-text transition-colors">
            {copied ? <Check size={10} /> : <CopyIcon size={10} />}
            Copy transcript
          </button>
        </div>
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

// ─── Frames Tab ─────────────────────────────────────────────
function FramesTab({ item, expandedFrame, setExpandedFrame }: {
  item: MoodboardItem; expandedFrame: number | null; setExpandedFrame: (i: number | null) => void;
}) {
  const frames = item.frames ?? [];

  if (frames.length === 0) {
    return <p className="text-sm text-text-muted text-center py-8 animate-fade-in">No frames extracted</p>;
  }

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Expanded frame */}
      {expandedFrame !== null && frames[expandedFrame] && (
        <div className="relative rounded-lg overflow-hidden border border-accent/30 mb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={frames[expandedFrame].url} alt={frames[expandedFrame].label} className="w-full" />
          <button onClick={() => setExpandedFrame(null)}
            className="cursor-pointer absolute top-2 right-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80 transition-colors">
            <X size={14} />
          </button>
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
            <p className="text-xs text-white font-medium">{frames[expandedFrame].label}</p>
            <p className="text-[10px] text-white/70">{formatTimestamp(frames[expandedFrame].timestamp)}</p>
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-3 gap-2">
        {frames.map((frame, i) => (
          <button key={i} onClick={() => setExpandedFrame(expandedFrame === i ? null : i)}
            className={`cursor-pointer group relative rounded-lg overflow-hidden border transition-colors ${
              expandedFrame === i ? 'border-accent' : 'border-nativz-border hover:border-accent/50'
            }`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={frame.url} alt={frame.label} className="w-full aspect-video object-cover" />
            <div className="absolute top-1 left-1 bg-black/70 text-white text-[9px] font-mono px-1 py-0.5 rounded">
              {formatTimestamp(frame.timestamp)}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Hook Tab ───────────────────────────────────────────────
function HookTab({ item }: { item: MoodboardItem }) {
  return (
    <div className="space-y-5 animate-fade-in">
      {/* Hook quote */}
      {item.hook ? (
        <div className="rounded-xl border border-accent/20 bg-accent-surface p-5">
          <Quote size={20} className="text-accent-text mb-2 opacity-50" />
          <p className="text-lg text-text-primary font-medium italic leading-relaxed">
            &ldquo;{item.hook}&rdquo;
          </p>
        </div>
      ) : (
        <p className="text-sm text-text-muted text-center py-4">No hook identified</p>
      )}

      {/* Hook score meter */}
      {item.hook_score != null && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-muted uppercase tracking-wide">Hook Score</span>
            <span className="text-2xl font-bold text-accent-text">{item.hook_score}<span className="text-sm text-text-muted">/10</span></span>
          </div>
          <HookScoreBar score={item.hook_score} />
        </div>
      )}

      {/* Hook type */}
      {item.hook_type && (
        <div>
          <span className="text-xs font-medium text-text-muted uppercase tracking-wide block mb-1.5">Type</span>
          <Badge variant="info" className="text-sm px-3 py-1">{item.hook_type.replace(/_/g, ' ')}</Badge>
        </div>
      )}

      {/* Hook analysis */}
      {item.hook_analysis && (
        <Section title="Why it works">
          <p className="text-sm text-text-secondary leading-relaxed">{item.hook_analysis}</p>
        </Section>
      )}

      {/* First 3 seconds */}
      {item.frames && item.frames.length > 0 && (
        <Section title="First 3 seconds">
          <div className="flex gap-2">
            {item.frames.filter(f => f.timestamp <= 3).map((frame, i) => (
              <div key={i} className="relative rounded-lg overflow-hidden border border-nativz-border flex-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={frame.url} alt={frame.label} className="w-full aspect-video object-cover" />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1.5">
                  <p className="text-[9px] text-white font-mono">{formatTimestamp(frame.timestamp)}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ─── Pacing Tab ─────────────────────────────────────────────
function PacingTab({ item }: { item: MoodboardItem }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawPacing = (item.pacing_detail || item.pacing) as any;

  if (!rawPacing) {
    return <p className="text-sm text-text-muted text-center py-8 animate-fade-in">No pacing data available</p>;
  }

  const pacingDescription: string = String(rawPacing.description ?? '');
  const estimatedCuts: number = Number(rawPacing.estimated_cuts ?? 0);
  const cutsPerMinute: number = Number(rawPacing.cuts_per_minute ?? 0);
  const pacingScenes: Array<{ timestamp: number; description: string }> = rawPacing.scenes ?? [];

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={<Scissors size={16} className="text-accent-text" />} value={estimatedCuts} label="Total cuts" />
        <StatCard icon={<Zap size={16} className="text-yellow-400" />} value={cutsPerMinute} label="Cuts/min" />
      </div>

      {/* Pacing description */}
      <div>
        <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5">Pacing style</h3>
        <p className="text-sm text-text-secondary">{pacingDescription}</p>
      </div>

      {/* Visual timeline */}
      {pacingScenes.length > 0 && item.duration && (
        <Section title="Scene Timeline">
          <div className="relative">
            {/* Timeline bar */}
            <div className="h-2 rounded-full bg-surface-hover border border-nativz-border relative">
              {pacingScenes.map((scene, i) => {
                const pct = (scene.timestamp / item.duration!) * 100;
                return (
                  <div key={i} className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-accent border-2 border-surface"
                    style={{ left: `${Math.min(pct, 97)}%` }}
                    title={`${formatTimestamp(scene.timestamp)} — ${scene.description}`}
                  />
                );
              })}
            </div>
            {/* Scene list */}
            <div className="mt-3 space-y-1.5">
              {pacingScenes.map((scene, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="text-accent-text font-mono shrink-0 w-10 text-right">{formatTimestamp(scene.timestamp)}</span>
                  <span className="text-text-secondary">{scene.description}</span>
                </div>
              ))}
            </div>
          </div>
        </Section>
      )}

      {/* Music info */}
      {item.music && (
        <div>
          <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5 flex items-center gap-1">
            <Music size={12} className="text-purple-400" />
            Music
          </h3>
          <p className="text-sm text-text-secondary">{item.music}</p>
        </div>
      )}
    </div>
  );
}

// ─── Brief Tab ──────────────────────────────────────────────
function BriefTab({ item, onReplicate, onCopy, copied }: {
  item: MoodboardItem; onReplicate: (item: MoodboardItem) => void; onCopy: (t: string) => void; copied: boolean;
}) {
  const handleDownloadPDF = () => {
    window.open(`/api/moodboard/items/${item.id}/brief/pdf`, '_blank');
  };

  if (!item.replication_brief) {
    return (
      <div className="text-center py-12 animate-fade-in">
        <FileText size={32} className="mx-auto text-text-muted mb-3 opacity-50" />
        <p className="text-sm text-text-muted mb-4">No brief generated yet</p>
        <Button onClick={() => onReplicate(item)} className="mx-auto">
          <CopyIcon size={14} />
          Generate Replication Brief
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Actions */}
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

      {/* Brief content */}
      <div className="rounded-lg border border-nativz-border bg-surface-hover/20 p-4 text-sm text-text-secondary whitespace-pre-wrap leading-relaxed max-h-[600px] overflow-y-auto prose-headings:text-text-primary prose-headings:font-semibold">
        {item.replication_brief}
      </div>
    </div>
  );
}

// ─── Shared Components ──────────────────────────────────────
function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5 flex items-center gap-1">
        {icon}
        {title}
      </h3>
      {children}
    </div>
  );
}

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="rounded-lg border border-nativz-border bg-surface-hover/30 p-3 text-center">
      <div className="mx-auto mb-1 w-fit">{icon}</div>
      <p className="text-xl font-bold text-text-primary">{value}</p>
      <p className="text-[10px] text-text-muted">{label}</p>
    </div>
  );
}

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
