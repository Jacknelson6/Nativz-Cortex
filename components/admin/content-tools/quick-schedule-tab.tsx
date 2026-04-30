'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Mic2,
  RefreshCcw,
  Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ClientLogo } from '@/components/clients/client-logo';

/**
 * Quick Schedule tab. Surfaces every item flagged ready-to-schedule,
 * regardless of whether it came from the Cortex-native editing
 * pipeline (status=approved) or the legacy Monday Content-Calendar
 * board (EM Approved label). The two sources are merged server-side
 * so the editor sees one queue ordered by "ready since."
 *
 * Each row shows a small source badge ("Cortex" or "Monday") so the
 * editor knows which pipeline the row will follow when they hit
 * Schedule. Internal rows surface their connected brand logo + name
 * directly from the project's client record; Monday rows show the
 * board group as the brand fallback (logos for Monday rows live in
 * iter 16.5+).
 *
 * Pipeline:
 *   1. Pull a still frame at ~1s into the master video as the post
 *      thumbnail.
 *   2. Run audio through Gemini transcribe to seed caption draft.
 *   3. Stamp captions from the brand's saved-caption snippets.
 *
 * Monday connectivity is optional. When MONDAY_API_TOKEN is missing
 * the API drops Monday rows + flags `monday_status: 'unconfigured'`;
 * we surface that as a small inline notice so the internal queue
 * still renders.
 */

interface ItemDTO {
  source: 'internal' | 'monday';
  id: string;
  name: string;
  brand: string;
  brandLogoUrl?: string | null;
  approvedAt: string | null;
  folderUrl: string | null;
  shareLink: string | null;
  status: string;
}

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | {
      kind: 'ok';
      items: ItemDTO[];
      mondayStatus: 'ok' | 'unconfigured' | 'error';
      mondayError?: string;
    }
  | { kind: 'error'; detail: string };

/** Per-row scheduling state. Held in a Record<rowKey, RowState> on the
 *  parent so the row UI survives queue refreshes (the API call can take
 *  several minutes; we don't want a manual refresh to drop the spinner).
 *  Row key is `${source}:${id}` so an internal project and a Monday
 *  item with the same numeric id never collide. */
type RowState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | {
      kind: 'done';
      shareUrl: string | null;
      dropId: string | null;
      mondayWriteback: 'ok' | 'skipped' | 'failed';
      mondayDetail: string | null;
    }
  | { kind: 'error'; detail: string };

const rowKey = (it: ItemDTO) => `${it.source}:${it.id}`;

export function QuickScheduleTab() {
  const [state, setState] = useState<LoadState>({ kind: 'idle' });
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});

  async function load(silent = false) {
    if (!silent) setState({ kind: 'loading' });
    try {
      const res = await fetch('/api/admin/content-tools/quick-schedule', {
        cache: 'no-store',
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { detail?: string; error?: string }
          | null;
        throw new Error(
          body?.detail ?? body?.error ?? `HTTP ${res.status}`,
        );
      }

      const data = (await res.json()) as {
        items: ItemDTO[];
        monday_status: 'ok' | 'unconfigured' | 'error';
        monday_error?: string;
      };
      setState({
        kind: 'ok',
        items: data.items ?? [],
        mondayStatus: data.monday_status ?? 'ok',
        mondayError: data.monday_error,
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Failed to load queue';
      if (silent) toast.error(detail);
      setState({ kind: 'error', detail });
    }
  }

  useEffect(() => {
    void load();
  }, []);

  /** Click handler for a row's Schedule button. Calls /start with the
   *  unified {source, id} payload; the route dispatches internally. */
  async function schedule(item: ItemDTO) {
    const key = rowKey(item);
    setRowStates((s) => ({ ...s, [key]: { kind: 'busy' } }));
    try {
      const res = await fetch('/api/admin/content-tools/quick-schedule/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: item.source, id: item.id }),
      });
      const body = (await res.json().catch(() => null)) as
        | {
            error?: string;
            detail?: string;
            dropId?: string | null;
            shareUrl?: string | null;
            scheduled?: number;
            failed?: number;
            mondayWriteback?: 'ok' | 'skipped' | 'failed';
            mondayDetail?: string | null;
            clientName?: string;
          }
        | null;

      if (!res.ok) {
        const detail = body?.detail ?? body?.error ?? `HTTP ${res.status}`;
        setRowStates((s) => ({ ...s, [key]: { kind: 'error', detail } }));
        toast.error(`Schedule failed for ${item.name}: ${detail}`);
        return;
      }

      const dropId = body?.dropId ?? null;
      const shareUrl = body?.shareUrl ?? null;
      const writeback = body?.mondayWriteback ?? 'skipped';
      setRowStates((s) => ({
        ...s,
        [key]: {
          kind: 'done',
          shareUrl,
          dropId,
          mondayWriteback: writeback,
          mondayDetail: body?.mondayDetail ?? null,
        },
      }));
      const scheduled = body?.scheduled ?? 0;
      toast.success(
        `${body?.clientName ?? item.name} scheduled (${scheduled} post${scheduled === 1 ? '' : 's'})`,
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'request failed';
      setRowStates((s) => ({ ...s, [key]: { kind: 'error', detail } }));
      toast.error(`Schedule failed for ${item.name}: ${detail}`);
    }
  }

  const items = state.kind === 'ok' ? state.items : [];
  const loading = state.kind === 'loading' || state.kind === 'idle';
  const mondayStatus = state.kind === 'ok' ? state.mondayStatus : null;
  const mondayError = state.kind === 'ok' ? state.mondayError : undefined;

  return (
    <div className="space-y-4">
      <PipelineExplainer />
      <ApprovedQueue
        items={items}
        loading={loading}
        state={state}
        rowStates={rowStates}
        mondayStatus={mondayStatus}
        mondayError={mondayError}
        onSchedule={schedule}
        onRefresh={() => void load(true)}
      />
    </div>
  );
}

function PipelineExplainer() {
  const steps = [
    {
      icon: ImageIcon,
      label: 'Thumbnails',
      detail: 'Still frame lifted from each master cut.',
    },
    {
      icon: Mic2,
      label: 'Transcripts',
      detail: 'Gemini transcribe to seed caption draft text.',
    },
    {
      icon: Wand2,
      label: 'Captions',
      detail: 'Pre-fill from the brand saved-caption library.',
    },
  ];

  return (
    <div className="rounded-xl border border-nativz-border bg-surface">
      <div className="flex items-center gap-3 border-b border-nativz-border px-5 py-4">
        <span className="flex size-9 items-center justify-center rounded-lg bg-accent-text/10 text-accent-text">
          <Wand2 className="size-4" />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-text-primary">
            Quick schedule
          </div>
          <div className="mt-0.5 text-xs text-text-muted">
            One pass over every editor-approved video before it hits the queue
          </div>
        </div>
      </div>
      <div className="grid gap-3 p-5 sm:grid-cols-3">
        {steps.map((s) => (
          <div
            key={s.label}
            className="flex items-start gap-3 rounded-lg border border-nativz-border/70 bg-background/40 p-3"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-nativz-border bg-background text-text-secondary">
              <s.icon className="size-3.5" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-medium text-text-primary">{s.label}</div>
              <div className="mt-0.5 text-xs text-text-muted">{s.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ApprovedQueue({
  items,
  loading,
  state,
  rowStates,
  mondayStatus,
  mondayError,
  onSchedule,
  onRefresh,
}: {
  items: ItemDTO[];
  loading: boolean;
  state: LoadState;
  rowStates: Record<string, RowState>;
  mondayStatus: 'ok' | 'unconfigured' | 'error' | null;
  mondayError?: string;
  onSchedule: (item: ItemDTO) => void | Promise<void>;
  onRefresh: () => void;
}) {
  const subtitle = (() => {
    if (loading) return 'Pulling editor-approved items...';
    if (state.kind === 'error') return 'Queue unreachable';
    if (state.kind === 'ok') {
      const internalCount = items.filter((i) => i.source === 'internal').length;
      const mondayCount = items.filter((i) => i.source === 'monday').length;
      if (items.length === 0) return 'No editor-approved items right now';
      const parts: string[] = [];
      if (internalCount > 0) {
        parts.push(`${internalCount} internal`);
      }
      if (mondayCount > 0) {
        parts.push(`${mondayCount} from Monday`);
      }
      return `${items.length} ready to schedule (${parts.join(', ')})`;
    }
    return 'Pulled from the editing pipeline + Monday EM-Approved board';
  })();

  return (
    <div className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-nativz-border px-5 py-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-text-primary">
            Editor-approved queue
          </div>
          <div className="mt-0.5 text-xs text-text-muted">{subtitle}</div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={loading}
          aria-label="Refresh queue"
        >
          <RefreshCcw size={14} className={loading ? 'animate-spin' : ''} />
        </Button>
      </div>

      {state.kind === 'error' && (
        <div className="flex items-start gap-2 border-b border-status-danger/20 bg-status-danger/5 px-5 py-3 text-xs text-status-danger">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <div className="min-w-0">
            <div className="font-medium">Couldn&apos;t load the queue.</div>
            <div className="mt-0.5 text-status-danger/80">{state.detail}</div>
          </div>
        </div>
      )}

      {mondayStatus === 'unconfigured' && (
        <div className="flex items-start gap-2 border-b border-nativz-border bg-background/40 px-5 py-2.5 text-xs text-text-muted">
          <Wand2 className="mt-0.5 size-3 shrink-0" />
          <div className="min-w-0">
            Monday integration not configured on this environment. Internal
            projects still appear; set MONDAY_API_TOKEN to surface the legacy
            queue.
          </div>
        </div>
      )}

      {mondayStatus === 'error' && (
        <div className="flex items-start gap-2 border-b border-status-warning/20 bg-status-warning/5 px-5 py-2.5 text-xs text-status-warning">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
          <div className="min-w-0">
            <span className="font-medium">Monday upstream is unhappy.</span>{' '}
            <span className="text-status-warning/80">
              {mondayError ?? 'Internal projects still load below.'}
            </span>
          </div>
        </div>
      )}

      {loading ? (
        <QueueSkeleton />
      ) : items.length === 0 ? (
        <EmptyQueue mondayStatus={mondayStatus} />
      ) : (
        <ul className="divide-y divide-nativz-border/60">
          {items.map((it) => {
            const key = rowKey(it);
            const rowState = rowStates[key] ?? { kind: 'idle' };
            return (
              <li
                key={key}
                className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <ClientLogo
                    src={it.brandLogoUrl ?? null}
                    name={it.brand}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-text-primary">
                        {it.name}
                      </span>
                      <SourceBadge source={it.source} />
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                      <span className="truncate">{it.brand}</span>
                      {it.approvedAt && (
                        <>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1 shrink-0">
                            <Clock3 className="size-3" />
                            {formatRelative(it.approvedAt)}
                          </span>
                        </>
                      )}
                      {it.folderUrl && (
                        <>
                          <span>·</span>
                          <a
                            href={it.folderUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex shrink-0 items-center gap-1 text-accent-text hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="size-3" />
                            Folder
                          </a>
                        </>
                      )}
                    </div>
                    {rowState.kind === 'error' && (
                      <div className="mt-1.5 flex items-start gap-1.5 text-xs text-status-danger">
                        <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                        <span className="break-words">{rowState.detail}</span>
                      </div>
                    )}
                    {rowState.kind === 'done' && rowState.mondayWriteback === 'failed' && (
                      <div className="mt-1.5 flex items-start gap-1.5 text-xs text-status-warning">
                        <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                        <span className="break-words">
                          Drop landed but Monday writeback failed:{' '}
                          {rowState.mondayDetail ?? 'unknown error'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <RowAction
                  rowState={rowState}
                  onSchedule={() => void onSchedule(it)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SourceBadge({ source }: { source: 'internal' | 'monday' }) {
  const label = source === 'internal' ? 'Cortex' : 'Monday';
  const tone =
    source === 'internal'
      ? 'border-accent/30 bg-accent-surface text-accent-text'
      : 'border-nativz-border bg-background text-text-muted';
  return (
    <span
      className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${tone}`}
    >
      {label}
    </span>
  );
}

function RowAction({
  rowState,
  onSchedule,
}: {
  rowState: RowState;
  onSchedule: () => void;
}) {
  if (rowState.kind === 'busy') {
    return (
      <Button variant="outline" size="sm" disabled className="shrink-0">
        <Loader2 size={12} className="animate-spin" />
        Scheduling...
      </Button>
    );
  }
  if (rowState.kind === 'done') {
    return (
      <div className="flex shrink-0 items-center gap-3 text-xs">
        <span className="inline-flex items-center gap-1 text-status-success">
          <CheckCircle2 className="size-3.5" />
          Scheduled
        </span>
        {rowState.shareUrl && (
          <a
            href={rowState.shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-accent-text hover:underline"
          >
            <ExternalLink className="size-3" />
            Share link
          </a>
        )}
      </div>
    );
  }
  if (rowState.kind === 'error') {
    return (
      <Button variant="outline" size="sm" onClick={onSchedule} className="shrink-0">
        Retry
        <ChevronRight size={12} />
      </Button>
    );
  }
  return (
    <Button variant="outline" size="sm" onClick={onSchedule} className="shrink-0">
      Schedule
      <ChevronRight size={12} />
    </Button>
  );
}

function QueueSkeleton() {
  return (
    <div className="divide-y divide-nativz-border/60">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-4">
          <div className="size-8 shrink-0 animate-pulse rounded-md bg-nativz-border" />
          <div className="h-4 w-44 animate-pulse rounded bg-nativz-border" />
          <div className="ml-auto h-6 w-20 animate-pulse rounded bg-nativz-border" />
        </div>
      ))}
    </div>
  );
}

function EmptyQueue({
  mondayStatus,
}: {
  mondayStatus: 'ok' | 'unconfigured' | 'error' | null;
}) {
  return (
    <div className="px-5 py-10 text-center">
      <CheckCircle2 className="mx-auto mb-3 h-7 w-7 text-text-tertiary" />
      <p className="text-sm text-text-secondary">Nothing in the queue.</p>
      <p className="mt-1 text-xs text-text-muted">
        {mondayStatus === 'unconfigured'
          ? 'Approve an editing project or wire up Monday to surface its queue here.'
          : 'Editor-approved videos land here as soon as a project flips to Approved.'}
      </p>
    </div>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Math.max(0, Date.now() - then);
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < hr) return `${Math.max(1, Math.round(diff / min))}m ago`;
  if (diff < day) return `${Math.round(diff / hr)}h ago`;
  if (diff < 7 * day) return `${Math.round(diff / day)}d ago`;
  return new Date(iso).toLocaleDateString();
}
