'use client';

import { useState } from 'react';
import { X, Film, FileText, Mic, Eye, Zap } from 'lucide-react';
import type { MoodboardItem } from '@/lib/types/moodboard';

interface SharedAnalysisPanelProps {
  item: MoodboardItem;
  onClose: () => void;
}

type Tab = 'overview' | 'transcript' | 'brief';

export function SharedAnalysisPanel({ item, onClose }: SharedAnalysisPanelProps) {
  const [tab, setTab] = useState<Tab>('overview');

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <Eye size={12} /> },
    { id: 'transcript', label: 'Transcript', icon: <Mic size={12} /> },
    { id: 'brief', label: 'Brief', icon: <FileText size={12} /> },
  ];

  return (
    <div className="fixed top-0 right-0 h-full w-[420px] bg-surface border-l border-nativz-border shadow-elevated z-50 flex flex-col animate-slide-in-right">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-nativz-border">
        <div className="flex items-center gap-2 min-w-0">
          <Film size={14} className="text-accent-text shrink-0" />
          <p className="text-sm font-semibold text-text-primary truncate">{item.title || 'Untitled'}</p>
        </div>
        <button onClick={onClose} className="cursor-pointer rounded-lg p-1.5 text-text-muted hover:bg-surface-hover transition-colors">
          <X size={16} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 pt-3 pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`cursor-pointer flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
              tab === t.id
                ? 'bg-accent-surface text-accent-text'
                : 'text-text-muted hover:text-text-secondary hover:bg-surface-hover'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {tab === 'overview' && (
          <div className="space-y-4">
            {item.hook && (
              <Section title="Hook" icon={<Zap size={12} className="text-yellow-400" />}>
                <p className="text-sm text-text-secondary italic">&ldquo;{item.hook}&rdquo;</p>
                {item.hook_score != null && (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-text-muted">Score:</span>
                    <span className={`text-xs font-bold ${
                      item.hook_score >= 7 ? 'text-green-400' : item.hook_score >= 4 ? 'text-yellow-400' : 'text-red-400'
                    }`}>{item.hook_score}/10</span>
                    {item.hook_type && <span className="text-[10px] text-text-muted bg-surface-hover rounded px-1">{item.hook_type}</span>}
                  </div>
                )}
              </Section>
            )}

            {item.concept_summary && (
              <Section title="Concept">
                <p className="text-sm text-text-secondary">{item.concept_summary}</p>
              </Section>
            )}

            {item.cta && (
              <Section title="CTA">
                <p className="text-sm text-text-secondary">{item.cta}</p>
              </Section>
            )}

            {(item.content_themes ?? []).length > 0 && (
              <Section title="Themes">
                <div className="flex flex-wrap gap-1">
                  {(item.content_themes ?? []).map((tag, i) => (
                    <span key={i} className="rounded-full bg-surface-hover border border-nativz-border px-2 py-0.5 text-[10px] text-text-secondary">{tag}</span>
                  ))}
                </div>
              </Section>
            )}

            {(item.winning_elements ?? []).length > 0 && (
              <Section title="Winning Elements">
                <ul className="space-y-1">
                  {(item.winning_elements ?? []).map((el, i) => (
                    <li key={i} className="text-sm text-text-secondary flex items-start gap-1.5">
                      <span className="text-green-400 mt-0.5">✓</span>
                      {el}
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </div>
        )}

        {tab === 'transcript' && (
          <div>
            {item.transcript ? (
              <div className="rounded-lg border border-nativz-border bg-surface-hover/20 p-4 text-sm text-text-secondary whitespace-pre-wrap leading-relaxed max-h-[600px] overflow-y-auto">
                {item.transcript}
              </div>
            ) : (
              <p className="text-sm text-text-muted text-center py-8">No transcript available</p>
            )}
          </div>
        )}

        {tab === 'brief' && (
          <div>
            {item.replication_brief ? (
              <div className="rounded-lg border border-nativz-border bg-surface-hover/20 p-4 text-sm text-text-secondary whitespace-pre-wrap leading-relaxed max-h-[600px] overflow-y-auto">
                {item.replication_brief}
              </div>
            ) : (
              <p className="text-sm text-text-muted text-center py-8">No brief generated</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

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
