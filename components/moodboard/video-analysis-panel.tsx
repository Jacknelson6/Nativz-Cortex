'use client';

import { useState } from 'react';
import { X, Play, Copy as CopyIcon, Check, Film, Clock, Scissors, Zap, AlertTriangle, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { MoodboardItem } from '@/lib/types/moodboard';

interface VideoAnalysisPanelProps {
  item: MoodboardItem;
  onClose: () => void;
  onReplicate: (item: MoodboardItem) => void;
}

type Tab = 'overview' | 'transcript' | 'frames' | 'pacing';

export function VideoAnalysisPanel({ item, onClose, onReplicate }: VideoAnalysisPanelProps) {
  const [tab, setTab] = useState<Tab>('overview');
  const [copied, setCopied] = useState(false);

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Copied to clipboard');
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'transcript', label: 'Transcript' },
    { id: 'frames', label: 'Frames' },
    { id: 'pacing', label: 'Pacing' },
  ];

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-lg border-l border-nativz-border bg-surface shadow-elevated overflow-y-auto animate-fade-slide-in">
        <div className="p-6 space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <Film size={18} className="text-accent-text" />
              <div>
                <h2 className="text-base font-semibold text-text-primary">{item.title || 'Video analysis'}</h2>
                {item.duration && (
                  <span className="text-xs text-text-muted flex items-center gap-1 mt-0.5">
                    <Clock size={10} />
                    {Math.floor(item.duration / 60)}:{String(item.duration % 60).padStart(2, '0')}
                  </span>
                )}
              </div>
            </div>
            <button onClick={onClose} className="cursor-pointer rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors">
              <X size={18} />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-nativz-border">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`cursor-pointer px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                  tab === t.id
                    ? 'border-accent text-accent-text'
                    : 'border-transparent text-text-muted hover:text-text-secondary'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {tab === 'overview' && (
            <div className="space-y-4 animate-fade-in">
              {/* Video embed placeholder */}
              <div className="aspect-video rounded-lg bg-surface-hover flex items-center justify-center overflow-hidden">
                {item.thumbnail_url ? (
                  <div className="relative w-full h-full">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.thumbnail_url} alt="" className="w-full h-full object-cover" />
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors"
                    >
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
                <div>
                  <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5">Summary</h3>
                  <p className="text-sm text-text-secondary">{item.concept_summary}</p>
                </div>
              )}

              {/* Content themes */}
              {(item.content_themes ?? []).length > 0 && (
                <div>
                  <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5">Themes</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {item.content_themes.map((tag, i) => (
                      <Badge key={i} variant="info">{tag}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Winning elements */}
              {(item.winning_elements ?? []).length > 0 && (
                <div>
                  <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5">
                    <Check size={12} className="inline text-emerald-400 mr-1" />
                    What works
                  </h3>
                  <ul className="space-y-1.5">
                    {item.winning_elements.map((el, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                        <Check size={12} className="text-emerald-400 shrink-0 mt-0.5" />
                        {el}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Improvement areas */}
              {(item.improvement_areas ?? []).length > 0 && (
                <div>
                  <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5">
                    <AlertTriangle size={12} className="inline text-yellow-400 mr-1" />
                    Could improve
                  </h3>
                  <ul className="space-y-1.5">
                    {item.improvement_areas.map((el, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                        <AlertTriangle size={12} className="text-yellow-400 shrink-0 mt-0.5" />
                        {el}
                      </li>
                    ))}
                  </ul>
                </div>
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
          )}

          {tab === 'transcript' && (
            <div className="space-y-3 animate-fade-in">
              {item.hook && (
                <div className="rounded-lg border border-accent/20 bg-accent-surface p-3">
                  <p className="text-[10px] font-medium text-accent-text uppercase tracking-wide mb-1">Hook</p>
                  <p className="text-sm text-text-primary italic">&ldquo;{item.hook}&rdquo;</p>
                  {item.hook_analysis && (
                    <p className="text-xs text-text-muted mt-1.5">{item.hook_analysis}</p>
                  )}
                </div>
              )}

              {item.transcript ? (
                <div className="relative">
                  <div className="rounded-lg border border-nativz-border bg-surface-hover/30 p-4 text-sm text-text-secondary whitespace-pre-wrap max-h-[400px] overflow-y-auto">
                    {item.transcript}
                  </div>
                  <button
                    onClick={() => handleCopy(item.transcript!)}
                    className="cursor-pointer absolute top-2 right-2 rounded-md bg-surface border border-nativz-border p-1.5 text-text-muted hover:text-text-secondary hover:bg-surface-hover transition-colors"
                  >
                    {copied ? <Check size={12} /> : <CopyIcon size={12} />}
                  </button>
                </div>
              ) : (
                <p className="text-sm text-text-muted text-center py-8">No transcript available</p>
              )}

              {item.cta && (
                <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-3">
                  <p className="text-[10px] font-medium text-orange-400 uppercase tracking-wide mb-1">Call to action</p>
                  <p className="text-sm text-text-primary">{item.cta}</p>
                </div>
              )}
            </div>
          )}

          {tab === 'frames' && (
            <div className="space-y-3 animate-fade-in">
              {(item.frames ?? []).length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {item.frames.map((frame, i) => (
                    <div key={i} className="group relative rounded-lg overflow-hidden border border-nativz-border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={frame.url} alt={frame.label} className="w-full aspect-video object-cover" />
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                        <p className="text-[10px] text-white font-medium">{frame.label}</p>
                        <p className="text-[9px] text-white/60">{frame.timestamp}s</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-muted text-center py-8">No frames extracted</p>
              )}
            </div>
          )}

          {tab === 'pacing' && (
            <div className="space-y-4 animate-fade-in">
              {item.pacing ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-nativz-border bg-surface-hover/30 p-3 text-center">
                      <Scissors size={16} className="mx-auto text-accent-text mb-1" />
                      <p className="text-xl font-bold text-text-primary">{item.pacing.estimated_cuts}</p>
                      <p className="text-[10px] text-text-muted">Total cuts</p>
                    </div>
                    <div className="rounded-lg border border-nativz-border bg-surface-hover/30 p-3 text-center">
                      <Zap size={16} className="mx-auto text-yellow-400 mb-1" />
                      <p className="text-xl font-bold text-text-primary">{item.pacing.cuts_per_minute}</p>
                      <p className="text-[10px] text-text-muted">Cuts/min</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5">Pacing style</h3>
                    <p className="text-sm text-text-secondary">{item.pacing.description}</p>
                  </div>
                </>
              ) : (
                <p className="text-sm text-text-muted text-center py-8">No pacing data available</p>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
