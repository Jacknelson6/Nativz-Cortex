'use client';

import { useMemo } from 'react';
import { Activity } from 'lucide-react';
import type { KnowledgeEntry, KnowledgeLink } from '@/lib/knowledge/types';

interface KnowledgeFeedProps {
  entries: KnowledgeEntry[];
  links: KnowledgeLink[];
}

function countProducedFromMeeting(links: KnowledgeLink[], meetingId: string): number {
  return links.filter(
    (l) =>
      l.label === 'produced' &&
      l.source_type === 'entry' &&
      l.target_type === 'entry' &&
      l.source_id === meetingId,
  ).length;
}

export function KnowledgeFeed({ entries, links }: KnowledgeFeedProps) {
  const lines = useMemo(() => {
    const sorted = [...entries].sort(
      (a, b) => new Date(b.updated_at ?? b.created_at).getTime() - new Date(a.updated_at ?? a.created_at).getTime(),
    );

    return sorted.slice(0, 40).map((e) => {
      const date = (e.updated_at ?? e.created_at ?? '').slice(0, 10);
      let detail = `${e.type.replace(/_/g, ' ')}`;
      if (e.type === 'meeting' || e.type === 'meeting_note') {
        const n = countProducedFromMeeting(links, e.id);
        if (n > 0) detail += ` · ${n} linked extract${n === 1 ? '' : 's'}`;
      }
      if (e.superseded_by) detail += ' · superseded';
      return { id: e.id, date, title: e.title, detail };
    });
  }, [entries, links]);

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-secondary text-sm p-8">
        <Activity className="size-8 opacity-40 mb-2" aria-hidden />
        <p>No knowledge activity yet.</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-1">
      <p className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-3">
        Recent changes
      </p>
      <ul className="space-y-2">
        {lines.map((line) => (
          <li
            key={line.id}
            className="rounded-lg border border-nativz-border bg-surface/60 px-3 py-2 text-sm"
          >
            <div className="text-xs text-text-secondary tabular-nums">{line.date}</div>
            <div className="font-medium text-text-primary truncate">{line.title}</div>
            <div className="text-xs text-text-secondary capitalize">{line.detail}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
