'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CalendarDays, Loader2 } from 'lucide-react';
import { DropListSmmFilter, type DropListSmmFilterValue } from './drop-list-smm-filter';
import type { ContentDrop } from '@/lib/types/calendar';
import type { HandoffState } from '@/lib/calendar/handoff-state';

const VALID: DropListSmmFilterValue[] = [
  'all',
  'editing',
  'smm_review',
  'smm_approved',
  'smm_rejected',
  'client_sent',
];

function normalize(raw: string | undefined): DropListSmmFilterValue {
  if (!raw) return 'smm_review';
  return (VALID as string[]).includes(raw) ? (raw as DropListSmmFilterValue) : 'smm_review';
}

interface DropRow extends ContentDrop {
  clients?: { name: string } | null;
}

interface Props {
  initialHandoff?: string;
}

export function SmmQueueView({ initialHandoff }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState<DropListSmmFilterValue>(() => normalize(initialHandoff));
  const [drops, setDrops] = useState<DropRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (value: DropListSmmFilterValue) => {
    setLoading(true);
    setError(null);
    try {
      const qs = value === 'all' ? '' : `?handoff=${value}`;
      const res = await fetch(`/api/calendar/drops${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Failed');
      setDrops(json.drops ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      setDrops([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh(filter);
  }, [filter, refresh]);

  const onChange = useCallback(
    (next: DropListSmmFilterValue) => {
      setFilter(next);
      const params = new URLSearchParams(searchParams.toString());
      if (next === 'all') params.delete('handoff');
      else params.set('handoff', next);
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : '?', { scroll: false });
    },
    [router, searchParams],
  );

  const heading = useMemo(() => {
    if (filter === 'all') return 'All drops';
    if (filter === 'smm_review') return 'Awaiting your review';
    if (filter === 'smm_approved') return 'Approved by SMM';
    if (filter === 'client_sent') return 'Sent to client';
    if (filter === 'smm_rejected') return 'Sent back to editor';
    return 'In editing';
  }, [filter]);

  return (
    <div className="cortex-page-gutter mx-auto max-w-6xl space-y-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-text-primary">
          <CalendarDays className="h-6 w-6 text-text-tertiary" />
          SMM review queue
        </h1>
        <p className="text-sm text-text-secondary">
          Drops grouped by handoff state. Open one to approve, request changes, or send to the client.
        </p>
      </header>

      <DropListSmmFilter value={filter} onChange={onChange} />

      <section className="rounded-xl border border-nativz-border bg-surface">
        <header className="flex items-center justify-between border-b border-nativz-border px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">{heading}</h2>
          <span className="text-xs text-text-muted">
            {loading ? '' : `${drops.length} drop${drops.length === 1 ? '' : 's'}`}
          </span>
        </header>
        {loading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-text-secondary">
            <Loader2 size={14} className="animate-spin" /> Loading drops…
          </div>
        ) : error ? (
          <div className="px-4 py-12 text-center text-sm text-red-300">{error}</div>
        ) : drops.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-text-muted">
            Nothing here right now.
          </p>
        ) : (
          <ul className="divide-y divide-nativz-border">
            {drops.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/calendar/${d.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-surface-hover"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {d.clients?.name ?? 'Unknown brand'}
                    </p>
                    <p className="text-xs text-text-muted">
                      {d.start_date} to {d.end_date} · {d.processed_videos}/{d.total_videos} posts
                    </p>
                  </div>
                  <HandoffStatePill state={d.handoff_state} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const PILL_TONE: Record<HandoffState, string> = {
  editing: 'bg-surface-hover text-text-secondary',
  smm_review: 'bg-amber-500/10 text-amber-300',
  smm_approved: 'bg-emerald-500/10 text-emerald-300',
  smm_rejected: 'bg-red-500/10 text-red-300',
  client_sent: 'bg-blue-500/10 text-blue-300',
};

const PILL_LABEL: Record<HandoffState, string> = {
  editing: 'In editing',
  smm_review: 'Awaiting review',
  smm_approved: 'Approved',
  smm_rejected: 'Changes requested',
  client_sent: 'Sent',
};

function HandoffStatePill({ state }: { state: HandoffState }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${PILL_TONE[state]}`}
    >
      {PILL_LABEL[state]}
    </span>
  );
}
