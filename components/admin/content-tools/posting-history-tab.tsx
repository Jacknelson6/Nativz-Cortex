'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface HistoryPlatform {
  platform: string;
  username: string | null;
  status: string;
  failure_reason: string | null;
  external_post_url: string | null;
}

interface HistoryRow {
  id: string;
  client_id: string;
  client_name: string | null;
  client_logo_url: string | null;
  drop_id: string | null;
  caption: string;
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  failure_reason: string | null;
  platforms: HistoryPlatform[];
}

type FilterMode = 'all' | 'success' | 'partial' | 'failed';

const FILTERS: { slug: FilterMode; label: string }[] = [
  { slug: 'all', label: 'All' },
  { slug: 'success', label: 'Published' },
  { slug: 'partial', label: 'Partial' },
  { slug: 'failed', label: 'Failed' },
];

/**
 * Cross-brand posting history. Lists every scheduled post that has
 * reached a publish-stage state with its per-platform results so Jack
 * can scan "what went out / what broke" at a glance without opening
 * each calendar.
 */
export function PostingHistoryTab() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterMode>('all');

  async function load(silent = false) {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch(`/api/admin/posting-history?status=${filter}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Failed to load posting history');
      const data = (await res.json()) as { rows: HistoryRow[] };
      setRows(data.rows ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load posting history');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const counts = useMemo(() => {
    let success = 0;
    let partial = 0;
    let failed = 0;
    for (const r of rows) {
      if (r.status === 'published') success += 1;
      else if (r.status === 'partially_failed') partial += 1;
      else if (r.status === 'failed') failed += 1;
    }
    return { success, partial, failed, total: rows.length };
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {FILTERS.map((f) => {
            const active = filter === f.slug;
            return (
              <button
                key={f.slug}
                onClick={() => setFilter(f.slug)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-nativz-border bg-surface text-text-muted hover:bg-surface-hover'
                }`}
              >
                {f.label}
              </button>
            );
          })}
          <span className="ml-2 text-[11px] text-text-muted">
            {counts.success} published · {counts.partial} partial · {counts.failed} failed
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void load(true)}
          disabled={refreshing}
          aria-label="Refresh posting history"
        >
          <RefreshCcw size={14} className={refreshing ? 'animate-spin' : ''} />
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-xl border border-nativz-border bg-surface py-16 text-sm text-text-muted">
          <Loader2 size={14} className="mr-2 animate-spin" />
          Loading posting history…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-nativz-border bg-surface py-16 text-center text-sm text-text-muted">
          No posts in this view yet. Once approved drops publish, they'll log here.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-hover/40 text-[11px] uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Brand</th>
                <th className="px-4 py-2 text-left font-medium">Caption</th>
                <th className="px-4 py-2 text-left font-medium">Platforms</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-left font-medium">When</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <HistoryRowItem key={row.id} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function HistoryRowItem({ row }: { row: HistoryRow }) {
  const isPublished = row.status === 'published';
  const isPartial = row.status === 'partially_failed';
  const isFailed = row.status === 'failed';
  const isPublishing = row.status === 'publishing';

  const when = row.published_at ?? row.scheduled_at;
  const whenLabel = when ? formatWhen(when) : '—';

  return (
    <tr className="border-t border-nativz-border align-top transition-colors hover:bg-surface-hover/30">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {row.client_logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={row.client_logo_url}
              alt={row.client_name ?? ''}
              className="h-7 w-7 rounded-full object-cover"
            />
          ) : (
            <div className="h-7 w-7 rounded-full bg-surface-hover" />
          )}
          <span className="truncate font-medium text-text-primary">
            {row.client_name ?? '—'}
          </span>
        </div>
      </td>
      <td className="max-w-xs px-4 py-3">
        <p className="line-clamp-2 text-xs text-text-muted">
          {row.caption || <span className="italic">No caption</span>}
        </p>
      </td>
      <td className="px-4 py-3">
        <ul className="space-y-1">
          {row.platforms.map((p, idx) => {
            const ok = p.status === 'published';
            const failed = p.status === 'failed';
            return (
              <li key={`${p.platform}-${idx}`} className="flex items-start gap-1.5 text-[11px]">
                {ok ? (
                  <CheckCircle2 size={11} className="mt-0.5 shrink-0 text-emerald-400" />
                ) : failed ? (
                  <AlertTriangle size={11} className="mt-0.5 shrink-0 text-red-400" />
                ) : (
                  <Loader2 size={11} className="mt-0.5 shrink-0 text-text-muted" />
                )}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="capitalize text-text-primary">{p.platform}</span>
                    {p.username && (
                      <span className="text-text-muted">@{p.username}</span>
                    )}
                    {ok && p.external_post_url && (
                      <a
                        href={p.external_post_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-0.5 text-accent hover:underline"
                      >
                        <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                  {failed && p.failure_reason && (
                    <p className="break-words text-[10px] text-red-300/80">
                      {p.failure_reason}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
          {row.platforms.length === 0 && (
            <li className="text-[11px] text-text-muted">No platforms</li>
          )}
        </ul>
      </td>
      <td className="px-4 py-3">
        <StatusBadge
          isPublished={isPublished}
          isPartial={isPartial}
          isFailed={isFailed}
          isPublishing={isPublishing}
        />
        {row.failure_reason && (isFailed || isPartial) && (
          <p className="mt-1 max-w-[14rem] break-words text-[10px] text-red-300/80">
            {row.failure_reason}
          </p>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-text-muted">{whenLabel}</td>
      <td className="px-4 py-3 text-right">
        {row.drop_id ? (
          <Link
            href={`/admin/calendar/${row.drop_id}#post-${row.id}`}
            className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
          >
            Open
            <ExternalLink size={11} />
          </Link>
        ) : (
          <span className="text-xs text-text-muted">—</span>
        )}
      </td>
    </tr>
  );
}

function StatusBadge({
  isPublished,
  isPartial,
  isFailed,
  isPublishing,
}: {
  isPublished: boolean;
  isPartial: boolean;
  isFailed: boolean;
  isPublishing: boolean;
}) {
  if (isPublished) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
        <CheckCircle2 size={10} /> Published
      </span>
    );
  }
  if (isPartial) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-300">
        <AlertTriangle size={10} /> Partial
      </span>
    );
  }
  if (isFailed) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-medium text-red-300">
        <AlertTriangle size={10} /> Failed
      </span>
    );
  }
  if (isPublishing) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-[11px] font-medium text-blue-300">
        <Loader2 size={10} className="animate-spin" /> Publishing
      </span>
    );
  }
  return null;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
