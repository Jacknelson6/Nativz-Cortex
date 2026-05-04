'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCcw,
  X,
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

interface ErrorModalState {
  row: HistoryRow;
  platform?: HistoryPlatform;
}

export function PostingHistoryTab() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [errorModal, setErrorModal] = useState<ErrorModalState | null>(null);

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
                <th className="px-4 py-2 text-left font-medium">Dates</th>
                <th className="px-4 py-2 text-left font-medium">Platforms</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <HistoryRowItem
                  key={row.id}
                  row={row}
                  onShowError={(platform) => setErrorModal({ row, platform })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {errorModal && (
        <ErrorLogModal
          state={errorModal}
          onClose={() => setErrorModal(null)}
        />
      )}
    </div>
  );
}

function HistoryRowItem({
  row,
  onShowError,
}: {
  row: HistoryRow;
  onShowError: (platform?: HistoryPlatform) => void;
}) {
  const isPublished = row.status === 'published';
  const isPartial = row.status === 'partially_failed';
  const isFailed = row.status === 'failed';
  const isPublishing = row.status === 'publishing';

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
      <td className="px-4 py-3">
        <DateColumn
          scheduledAt={row.scheduled_at}
          publishedAt={row.published_at}
        />
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
                    {failed && p.failure_reason && (
                      <button
                        type="button"
                        onClick={() => onShowError(p)}
                        className="inline-flex items-center gap-0.5 rounded border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-300 transition-colors hover:bg-red-500/20"
                      >
                        Error
                      </button>
                    )}
                  </div>
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
          <button
            type="button"
            onClick={() => onShowError()}
            className="mt-1 inline-flex items-center gap-0.5 rounded border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-300 transition-colors hover:bg-red-500/20"
          >
            Error
          </button>
        )}
      </td>
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

function DateColumn({
  scheduledAt,
  publishedAt,
}: {
  scheduledAt: string | null;
  publishedAt: string | null;
}) {
  return (
    <div className="space-y-0.5 text-[11px] text-text-muted">
      <div>
        <span className="text-text-muted/70">Scheduled </span>
        <span className="text-text-primary">
          {scheduledAt ? formatFullDate(scheduledAt) : '—'}
        </span>
      </div>
      <div>
        <span className="text-text-muted/70">Published </span>
        <span className="text-text-primary">
          {publishedAt ? formatFullDate(publishedAt) : '—'}
        </span>
      </div>
    </div>
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

function ErrorLogModal({
  state,
  onClose,
}: {
  state: ErrorModalState;
  onClose: () => void;
}) {
  const { row, platform } = state;

  const logText = useMemo(() => buildErrorLog(row, platform), [row, platform]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(logText);
      toast.success('Error log copied');
    } catch {
      toast.error('Could not copy log');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl overflow-hidden rounded-xl border border-nativz-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-nativz-border px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text-primary">
              {platform
                ? `${capitalize(platform.platform)} publish error`
                : 'Publish error'}
            </p>
            <p className="truncate text-[11px] text-text-muted">
              {row.client_name ?? 'Unknown brand'}
              {platform?.username ? ` · @${platform.username}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-1 rounded-md border border-nativz-border bg-surface-hover px-2 py-1 text-xs text-text-primary transition-colors hover:bg-surface-hover/70"
            >
              <Copy size={12} />
              Copy
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-1 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
            >
              <X size={14} />
            </button>
          </div>
        </div>
        <pre className="max-h-[60vh] overflow-auto bg-black/60 px-4 py-3 font-mono text-[11px] leading-relaxed text-red-200">
{logText}
        </pre>
      </div>
    </div>
  );
}

function buildErrorLog(row: HistoryRow, platform?: HistoryPlatform): string {
  const lines: string[] = [];
  lines.push(`# Publish error report`);
  lines.push(`Brand:        ${row.client_name ?? '(unknown)'}`);
  lines.push(`Post ID:      ${row.id}`);
  if (row.drop_id) lines.push(`Drop ID:      ${row.drop_id}`);
  lines.push(`Status:       ${row.status}`);
  lines.push(`Scheduled:    ${row.scheduled_at ?? '—'}`);
  lines.push(`Published:    ${row.published_at ?? '—'}`);
  lines.push('');

  if (platform) {
    lines.push(`[${platform.platform}${platform.username ? ` @${platform.username}` : ''}] ${platform.status}`);
    lines.push(platform.failure_reason ?? '(no failure reason recorded)');
  } else {
    if (row.failure_reason) {
      lines.push(`[post-level]`);
      lines.push(row.failure_reason);
      lines.push('');
    }
    const failedPlatforms = row.platforms.filter((p) => p.status === 'failed');
    for (const p of failedPlatforms) {
      lines.push(`[${p.platform}${p.username ? ` @${p.username}` : ''}] ${p.status}`);
      lines.push(p.failure_reason ?? '(no failure reason recorded)');
      lines.push('');
    }
  }

  return lines.join('\n').trimEnd();
}

function formatFullDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
