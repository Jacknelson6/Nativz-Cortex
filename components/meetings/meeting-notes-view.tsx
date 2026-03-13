'use client';

import { useState, useMemo } from 'react';
import {
  Plus,
  Calendar,
  Users,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Building2,
  Clock,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatRelativeTime } from '@/lib/utils/format';
import { ImportMeetingModal } from './import-meeting-modal';

interface MeetingNote {
  id: string;
  client_id: string;
  title: string;
  content: string;
  metadata: Record<string, unknown> | null;
  source: string;
  created_at: string;
  updated_at: string;
}

interface Client {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
}

interface MeetingNotesViewProps {
  initialNotes: MeetingNote[];
  clients: Client[];
}

export function MeetingNotesView({ initialNotes, clients }: MeetingNotesViewProps) {
  const [notes, setNotes] = useState(initialNotes);
  const [showImport, setShowImport] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [clientFilter, setClientFilter] = useState<string>('all');

  const clientMap = useMemo(() => {
    const map = new Map<string, Client>();
    for (const c of clients) map.set(c.id, c);
    return map;
  }, [clients]);

  const filteredNotes = useMemo(() => {
    if (clientFilter === 'all') return notes;
    return notes.filter((n) => n.client_id === clientFilter);
  }, [notes, clientFilter]);

  function handleImported(note: MeetingNote) {
    setNotes((prev) => [note, ...prev]);
    setShowImport(false);
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Meeting notes</h1>
          <p className="text-sm text-text-muted mt-0.5">
            Import and manage meeting transcripts from Fyxer.ai
          </p>
        </div>
        <Button onClick={() => setShowImport(true)}>
          <Plus size={16} />
          Import notes
        </Button>
      </div>

      {/* Filter */}
      {clients.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">Filter:</span>
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="rounded-lg border border-nativz-border bg-surface px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/50"
          >
            <option value="all">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Notes list */}
      {filteredNotes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FileText size={32} className="text-text-muted mb-3" />
          <p className="text-sm font-medium text-text-secondary">No meeting notes yet</p>
          <p className="text-xs text-text-muted mt-1">
            Import a transcript from Fyxer.ai to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredNotes.map((note) => {
            const client = clientMap.get(note.client_id);
            const meta = note.metadata as {
              meeting_date?: string;
              attendees?: string[];
              action_items?: string[];
              source?: string;
            } | null;
            const isExpanded = expandedId === note.id;

            return (
              <div
                key={note.id}
                className="rounded-xl border border-nativz-border bg-surface overflow-hidden transition-all"
              >
                {/* Header row */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : note.id)}
                  className="cursor-pointer w-full flex items-start gap-4 p-4 text-left hover:bg-surface-hover/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium text-text-primary truncate">
                        {note.title}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                      {client && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-text-muted">
                          <Building2 size={10} />
                          {client.name}
                        </span>
                      )}
                      {meta?.meeting_date && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-text-muted">
                          <Calendar size={10} />
                          {new Date(meta.meeting_date + 'T00:00:00').toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                      )}
                      {meta?.attendees && meta.attendees.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-text-muted">
                          <Users size={10} />
                          {meta.attendees.length} attendee{meta.attendees.length !== 1 ? 's' : ''}
                        </span>
                      )}
                      {meta?.action_items && meta.action_items.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-text-muted">
                          <CheckCircle2 size={10} />
                          {meta.action_items.length} action item{meta.action_items.length !== 1 ? 's' : ''}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 text-[11px] text-text-muted">
                        <Clock size={10} />
                        {formatRelativeTime(note.created_at)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 mt-0.5">
                    {meta?.source && (
                      <Badge>{meta.source}</Badge>
                    )}
                    {isExpanded ? (
                      <ChevronUp size={14} className="text-text-muted" />
                    ) : (
                      <ChevronDown size={14} className="text-text-muted" />
                    )}
                  </div>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-nativz-border pt-3 space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
                    {/* Attendees */}
                    {meta?.attendees && meta.attendees.length > 0 && (
                      <div>
                        <p className="text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1.5">
                          Attendees
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {meta.attendees.map((a, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center rounded-full bg-surface-hover px-2.5 py-0.5 text-[11px] text-text-secondary"
                            >
                              {a}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Action items */}
                    {meta?.action_items && meta.action_items.length > 0 && (
                      <div>
                        <p className="text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1.5">
                          Action items
                        </p>
                        <ul className="space-y-1">
                          {meta.action_items.map((item, i) => (
                            <li
                              key={i}
                              className="flex items-start gap-2 text-xs text-text-secondary"
                            >
                              <CheckCircle2 size={12} className="text-emerald-400 mt-0.5 shrink-0" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Content preview */}
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
          })}
        </div>
      )}

      {/* Import modal */}
      {showImport && (
        <ImportMeetingModal
          clients={clients}
          onClose={() => setShowImport(false)}
          onImported={handleImported}
        />
      )}
    </div>
  );
}
