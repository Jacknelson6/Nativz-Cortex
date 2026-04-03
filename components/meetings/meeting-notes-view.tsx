'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, FileText, List, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ImportMeetingModal } from './import-meeting-modal';
import { MeetingNoteRow, type MeetingNoteRowNote } from './meeting-note-row';
import type { MeetingNoteMetadata } from '@/lib/knowledge/types';
import {
  extractFyxerSubjectFromNoteTitle,
  inferMeetingSeriesFromText,
  meetingDateSortKey,
} from '@/lib/meetings/meeting-note-helpers';

interface Client {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
}

type MeetingSeriesFilter = 'all' | 'recurring' | 'adhoc';

interface MeetingNotesViewProps {
  initialNotes: MeetingNoteRowNote[];
  clients: Client[];
  prospectBucketClientId: string | null;
}

function getEffectiveMeetingSeries(note: MeetingNoteRowNote): 'recurring' | 'adhoc' {
  const m = note.metadata as MeetingNoteMetadata | null;
  if (m?.meeting_series === 'recurring' || m?.meeting_series === 'adhoc') {
    return m.meeting_series;
  }
  const subj = extractFyxerSubjectFromNoteTitle(note.title);
  return inferMeetingSeriesFromText(`${subj} ${note.title}`);
}

function getEffectiveAssociation(
  note: MeetingNoteRowNote,
  prospectBucketClientId: string | null,
): 'client' | 'prospect' {
  const m = note.metadata as MeetingNoteMetadata | null;
  if (m?.association === 'prospect' || m?.association === 'client') {
    return m.association;
  }
  if (prospectBucketClientId && note.client_id === prospectBucketClientId) {
    return 'prospect';
  }
  return 'client';
}

function getDisplayCompany(
  note: MeetingNoteRowNote,
  clientMap: Map<string, Client>,
  prospectBucketClientId: string | null,
): string {
  const m = note.metadata as MeetingNoteMetadata | null;
  if (m?.company_label?.trim()) {
    return m.company_label.trim();
  }
  const client = clientMap.get(note.client_id);
  if (prospectBucketClientId && note.client_id === prospectBucketClientId) {
    return client?.name ?? 'Prospects';
  }
  return client?.name ?? 'Unknown';
}

function sortNotesDesc(a: MeetingNoteRowNote, b: MeetingNoteRowNote): number {
  return (
    meetingDateSortKey(b.metadata, b.created_at) - meetingDateSortKey(a.metadata, a.created_at)
  );
}

export function MeetingNotesView({
  initialNotes,
  clients,
  prospectBucketClientId,
}: MeetingNotesViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const seriesParam = searchParams.get('series');
  const seriesFromUrl: MeetingSeriesFilter =
    seriesParam === 'recurring' || seriesParam === 'adhoc' ? seriesParam : 'all';
  const [notes, setNotes] = useState(initialNotes);
  const [showImport, setShowImport] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [associationFilter, setAssociationFilter] = useState<'all' | 'client' | 'prospect'>('all');
  const [companyQuery, setCompanyQuery] = useState('');

  const clientMap = useMemo(() => {
    const map = new Map<string, Client>();
    for (const c of clients) map.set(c.id, c);
    return map;
  }, [clients]);

  const baseFiltered = useMemo(() => {
    let list = notes;

    if (clientFilter !== 'all') {
      list = list.filter((n) => n.client_id === clientFilter);
    }

    if (associationFilter !== 'all') {
      list = list.filter(
        (n) => getEffectiveAssociation(n, prospectBucketClientId) === associationFilter,
      );
    }

    const q = companyQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((n) => {
        const company = getDisplayCompany(n, clientMap, prospectBucketClientId).toLowerCase();
        const title = n.title.toLowerCase();
        return company.includes(q) || title.includes(q);
      });
    }

    return [...list].sort(sortNotesDesc);
  }, [notes, clientFilter, associationFilter, companyQuery, clientMap, prospectBucketClientId]);

  const recurringNotes = useMemo(
    () => baseFiltered.filter((n) => getEffectiveMeetingSeries(n) === 'recurring'),
    [baseFiltered],
  );

  const adhocNotes = useMemo(
    () => baseFiltered.filter((n) => getEffectiveMeetingSeries(n) === 'adhoc'),
    [baseFiltered],
  );

  const singleSeriesList =
    seriesFromUrl === 'recurring'
      ? recurringNotes
      : seriesFromUrl === 'adhoc'
        ? adhocNotes
        : null;

  function setSeriesRoute(next: MeetingSeriesFilter) {
    if (next === 'all') {
      router.push('/admin/meetings');
    } else {
      router.push(`/admin/meetings?series=${next}`);
    }
  }

  function handleToggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function handleImported(note: MeetingNoteRowNote) {
    setNotes((prev) => [note, ...prev]);
    setShowImport(false);
  }

  function renderList(items: MeetingNoteRowNote[]) {
    if (items.length === 0) {
      return (
        <p className="text-xs text-text-muted py-6 text-center">No meeting notes in this group.</p>
      );
    }
    return (
      <div className="space-y-3">
        {items.map((note) => (
          <MeetingNoteRow
            key={note.id}
            note={note}
            displayCompany={getDisplayCompany(note, clientMap, prospectBucketClientId)}
            series={getEffectiveMeetingSeries(note)}
            association={getEffectiveAssociation(note, prospectBucketClientId)}
            expandedId={expandedId}
            onToggleExpand={handleToggleExpand}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="cortex-page-gutter space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="ui-page-title-md">Meetings</h1>
          <p className="text-sm text-text-muted mt-0.5">
            Fyxer notes grouped by cadence; filter by client, prospect, or company name.
          </p>
        </div>
        <Button onClick={() => setShowImport(true)} className="shrink-0">
          <Plus size={16} />
          Import notes
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={seriesFromUrl === 'all' ? 'primary' : 'secondary'}
          size="sm"
          className="gap-1.5"
          onClick={() => setSeriesRoute('all')}
        >
          <List size={14} />
          All
        </Button>
        <Button
          type="button"
          variant={seriesFromUrl === 'recurring' ? 'primary' : 'secondary'}
          size="sm"
          className="gap-1.5"
          onClick={() => setSeriesRoute('recurring')}
        >
          <RefreshCw size={14} />
          Recurring
        </Button>
        <Button
          type="button"
          variant={seriesFromUrl === 'adhoc' ? 'primary' : 'secondary'}
          size="sm"
          className="gap-1.5"
          onClick={() => setSeriesRoute('adhoc')}
        >
          <Sparkles size={14} />
          Ad hoc
        </Button>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
        <div className="flex flex-wrap gap-3">
          {clients.length > 0 && (
            <div>
              <label className="block text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1">
                Client
              </label>
              <select
                value={clientFilter}
                onChange={(e) => setClientFilter(e.target.value)}
                className="rounded-lg border border-nativz-border bg-surface px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/50 min-w-[160px]"
              >
                <option value="all">All clients</option>
                {prospectBucketClientId && (
                  <option value={prospectBucketClientId}>Prospects (unmatched)</option>
                )}
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1">
              Association
            </label>
            <select
              value={associationFilter}
              onChange={(e) =>
                setAssociationFilter(e.target.value as 'all' | 'client' | 'prospect')
              }
              className="rounded-lg border border-nativz-border bg-surface px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/50 min-w-[140px]"
            >
              <option value="all">All</option>
              <option value="client">Clients only</option>
              <option value="prospect">Prospects only</option>
            </select>
          </div>
        </div>
        <div className="flex-1 min-w-[200px] max-w-md">
          <label className="block text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1">
            Company / title search
          </label>
          <input
            type="search"
            value={companyQuery}
            onChange={(e) => setCompanyQuery(e.target.value)}
            placeholder="Filter by company or meeting title…"
            className="w-full rounded-lg border border-nativz-border bg-surface px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/50"
          />
        </div>
      </div>

      {!prospectBucketClientId && (
        <p className="text-xs text-amber-200/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          Add an active client with slug{' '}
          <code className="text-xs bg-background/50 px-1 rounded">fyxer-prospects</code> to capture
          Fyxer meetings that do not match a named client.
        </p>
      )}

      {baseFiltered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FileText size={32} className="text-text-muted mb-3" />
          <p className="text-sm font-medium text-text-secondary">No meeting notes match</p>
          <p className="text-xs text-text-muted mt-1">Adjust filters or import a Fyxer transcript.</p>
        </div>
      ) : singleSeriesList ? (
        <div>{renderList(singleSeriesList)}</div>
      ) : (
        <div className="space-y-10">
          <section>
            <div className="flex items-center gap-2 mb-3">
              <RefreshCw size={16} className="text-text-muted" />
              <h2 className="text-sm font-semibold text-text-primary">Recurring</h2>
              <span className="text-xs text-text-muted">({recurringNotes.length})</span>
            </div>
            {renderList(recurringNotes)}
          </section>
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={16} className="text-text-muted" />
              <h2 className="text-sm font-semibold text-text-primary">Ad hoc</h2>
              <span className="text-xs text-text-muted">({adhocNotes.length})</span>
            </div>
            {renderList(adhocNotes)}
          </section>
        </div>
      )}

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
