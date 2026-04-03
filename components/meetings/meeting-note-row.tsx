'use client';

import {
  Calendar,
  Users,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Building2,
  Clock,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatRelativeTime } from '@/lib/utils/format';
import type { MeetingNoteMetadata } from '@/lib/knowledge/types';

export interface MeetingNoteRowNote {
  id: string;
  client_id: string;
  title: string;
  content: string;
  metadata: Record<string, unknown> | null;
  source: string;
  created_at: string;
  updated_at: string;
}

interface MeetingNoteRowProps {
  note: MeetingNoteRowNote;
  displayCompany: string;
  series: 'recurring' | 'adhoc';
  association: 'client' | 'prospect';
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
}

export function MeetingNoteRow({
  note,
  displayCompany,
  series,
  association,
  expandedId,
  onToggleExpand,
}: MeetingNoteRowProps) {
  const meta = note.metadata as MeetingNoteMetadata | null;
  const isExpanded = expandedId === note.id;

  return (
    <div className="rounded-xl border border-nativz-border bg-surface overflow-hidden transition-all">
      <button
        type="button"
        onClick={() => onToggleExpand(note.id)}
        className="cursor-pointer w-full flex items-start gap-4 p-4 text-left hover:bg-surface-hover/50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <p className="text-sm font-medium text-text-primary truncate">{note.title}</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap mb-1">
            <Badge variant="mono" className="text-[10px] font-normal gap-1">
              {series === 'recurring' ? (
                <RefreshCw size={10} className="shrink-0 opacity-80" />
              ) : (
                <Sparkles size={10} className="shrink-0 opacity-80" />
              )}
              {series === 'recurring' ? 'Recurring' : 'Ad hoc'}
            </Badge>
            {association === 'prospect' ? (
              <Badge variant="warning" className="text-[10px] font-normal">
                Prospect
              </Badge>
            ) : null}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1 text-xs text-text-muted min-w-0">
              <Building2 size={10} className="shrink-0" />
              <span className="truncate max-w-[min(280px,100%)]">{displayCompany}</span>
            </span>
            {meta?.meeting_date && (
              <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                <Calendar size={10} />
                {new Date(meta.meeting_date + 'T00:00:00').toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            )}
            {meta?.attendees && meta.attendees.length > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                <Users size={10} />
                {meta.attendees.length} attendee{meta.attendees.length !== 1 ? 's' : ''}
              </span>
            )}
            {meta?.action_items && meta.action_items.length > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                <CheckCircle2 size={10} />
                {meta.action_items.length} action item{meta.action_items.length !== 1 ? 's' : ''}
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-xs text-text-muted">
              <Clock size={10} />
              {formatRelativeTime(note.created_at)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 mt-0.5">
          {meta?.source && <Badge>{meta.source}</Badge>}
          {isExpanded ? (
            <ChevronUp size={14} className="text-text-muted" />
          ) : (
            <ChevronDown size={14} className="text-text-muted" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 border-t border-nativz-border pt-3 space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
          {meta?.attendees && meta.attendees.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1.5">
                Attendees
              </p>
              <div className="flex flex-wrap gap-1.5">
                {meta.attendees.map((a, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center rounded-full bg-surface-hover px-2.5 py-0.5 text-xs text-text-secondary"
                  >
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}

          {meta?.action_items && meta.action_items.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1.5">
                Action items
              </p>
              <ul className="space-y-1">
                {meta.action_items.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-text-secondary">
                    <CheckCircle2 size={12} className="text-emerald-400 mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1.5">
              Notes
            </p>
            <div className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto rounded-lg bg-background border border-nativz-border p-3 font-mono">
              {note.content.slice(0, 2000)}
              {note.content.length > 2000 && '...'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
