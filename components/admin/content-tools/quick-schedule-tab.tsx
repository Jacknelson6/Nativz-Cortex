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

/**
 * Quick Schedule tab. Surfaces every Monday Content-Calendar item
 * flagged as "EM Approved" (editor-marked done), then walks the admin
 * through the standard pre-schedule polish per row:
 *
 *   1. Pull a still frame at ~1s into the master video as the post
 *      thumbnail (we already do this in the scheduler; the API is
 *      reused here).
 *   2. Run the audio through Gemini transcribe to lift quotable lines
 *      out for caption seed text.
 *   3. Stamp captions from the brand's saved-caption snippets, leaving
 *      the editor a tight first draft instead of a blank sheet.
 *
 * The API surface for this pipeline isn't fully wired yet -- iteration
 * 14.4 ships the actual Monday pull + thumbnail/transcribe/caption
 * pipeline. This iteration paints the explainer + a refresh button so
 * the tab isn't blank, and so admins know what's coming.
 */

interface ApprovedItem {
  itemId: string;
  itemName: string;
  groupName: string;
  approvedAt: string | null;
  folderUrl: string | null;
  shareLink: string | null;
  status: string;
}

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; items: ApprovedItem[] }
  | { kind: 'unconfigured'; detail: string }
  | { kind: 'error'; detail: string };

/** Per-row scheduling state. Held in a Record<itemId, RowState> on the
 *  parent so the row UI survives queue refreshes (the API call can take
 *  several minutes; we don't want a manual refresh to drop the spinner).
 *  `done` keeps the share link visible until the next full reload swaps
 *  the row off the EM-Approved queue (Monday writeback flips status). */
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

export function QuickScheduleTab() {
  const [state, setState] = useState<LoadState>({ kind: 'idle' });
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});

  async function load(silent = false) {
    if (!silent) setState({ kind: 'loading' });
    try {
      const res = await fetch('/api/admin/content-tools/quick-schedule', {
        cache: 'no-store',
      });

      // 503 = MONDAY_API_TOKEN missing on this env. Distinct from a
      // generic upstream error so the tab can paint a "coming online"
      // placeholder rather than a scary banner.
      if (res.status === 503) {
        const body = (await res.json().catch(() => null)) as
          | { detail?: string }
          | null;
        setState({
          kind: 'unconfigured',
          detail: body?.detail ?? 'MONDAY_API_TOKEN not set',
        });
        return;
      }

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { detail?: string; error?: string }
          | null;
        throw new Error(
          body?.detail ?? body?.error ?? `HTTP ${res.status}`,
        );
      }

      const data = (await res.json()) as { items: ApprovedItem[] };
      setState({ kind: 'ok', items: data.items ?? [] });
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Failed to load queue';
      if (silent) toast.error(detail);
      setState({ kind: 'error', detail });
    }
  }

  useEffect(() => {
    void load();
  }, []);

  /** Click handler for a row's Schedule button. Calls /start, which is
   *  synchronous in iter 15.1 (the request can hold for minutes). The
   *  per-row state machine in `rowStates` is the single place we track
   *  in-flight + done + failed so a manual queue refresh mid-call
   *  doesn't blow away the spinner. */
  async function schedule(itemId: string, itemName: string) {
    setRowStates((s) => ({ ...s, [itemId]: { kind: 'busy' } }));
    try {
      const res = await fetch('/api/admin/content-tools/quick-schedule/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId }),
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
        setRowStates((s) => ({ ...s, [itemId]: { kind: 'error', detail } }));
        toast.error(`Schedule failed for ${itemName}: ${detail}`);
        return;
      }

      const dropId = body?.dropId ?? null;
      const shareUrl = body?.shareUrl ?? null;
      const writeback = body?.mondayWriteback ?? 'skipped';
      setRowStates((s) => ({
        ...s,
        [itemId]: {
          kind: 'done',
          shareUrl,
          dropId,
          mondayWriteback: writeback,
          mondayDetail: body?.mondayDetail ?? null,
        },
      }));
      const scheduled = body?.scheduled ?? 0;
      toast.success(
        `${body?.clientName ?? itemName} scheduled (${scheduled} post${scheduled === 1 ? '' : 's'})`,
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'request failed';
      setRowStates((s) => ({ ...s, [itemId]: { kind: 'error', detail } }));
      toast.error(`Schedule failed for ${itemName}: ${detail}`);
    }
  }

  const items = state.kind === 'ok' ? state.items : [];
  const loading = state.kind === 'loading' || state.kind === 'idle';

  return (
    <div className="space-y-4">
      <PipelineExplainer />
      <ApprovedQueue
        items={items}
        loading={loading}
        state={state}
        rowStates={rowStates}
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
  onSchedule,
  onRefresh,
}: {
  items: ApprovedItem[];
  loading: boolean;
  state: LoadState;
  rowStates: Record<string, RowState>;
  onSchedule: (itemId: string, itemName: string) => void | Promise<void>;
  onRefresh: () => void;
}) {
  const subtitle = (() => {
    if (loading) return 'Pulling EM-Approved items from Monday...';
    if (state.kind === 'unconfigured') {
      return 'Monday integration not configured on this environment';
    }
    if (state.kind === 'error') return 'Monday queue unreachable';
    if (state.kind === 'ok') {
      return items.length === 0
        ? 'No editor-approved items right now'
        : `${items.length} editor-approved item${items.length === 1 ? '' : 's'} ready to schedule`;
    }
    return 'Pulled from Monday Content Calendars where the EM Approved label is set';
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
            <div className="font-medium">Couldn&apos;t reach Monday.</div>
            <div className="mt-0.5 text-status-danger/80">{state.detail}</div>
          </div>
        </div>
      )}

      {loading ? (
        <QueueSkeleton />
      ) : state.kind === 'unconfigured' ? (
        <UnconfiguredState detail={state.detail} />
      ) : items.length === 0 ? (
        <EmptyQueue />
      ) : (
        <ul className="divide-y divide-nativz-border/60">
          {items.map((it) => {
            const rowState = rowStates[it.itemId] ?? { kind: 'idle' };
            return (
              <li
                key={it.itemId}
                className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-text-primary">
                    {it.itemName}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                    <span className="truncate">{it.groupName}</span>
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
                        Drop landed but Monday writeback failed: {rowState.mondayDetail ?? 'unknown error'}
                      </span>
                    </div>
                  )}
                </div>
                <RowAction
                  rowState={rowState}
                  onSchedule={() => void onSchedule(it.itemId, it.itemName)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
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
          <div className="h-4 w-44 animate-pulse rounded bg-nativz-border" />
          <div className="ml-auto h-6 w-20 animate-pulse rounded bg-nativz-border" />
        </div>
      ))}
    </div>
  );
}

function EmptyQueue() {
  return (
    <div className="px-5 py-10 text-center">
      <CheckCircle2 className="mx-auto mb-3 h-7 w-7 text-text-tertiary" />
      <p className="text-sm text-text-secondary">Nothing in the queue.</p>
      <p className="mt-1 text-xs text-text-muted">
        Editor-approved videos will land here as soon as Monday flips the label.
      </p>
    </div>
  );
}

function UnconfiguredState({ detail }: { detail: string }) {
  return (
    <div className="px-5 py-10 text-center">
      <Wand2 className="mx-auto mb-3 h-7 w-7 text-text-tertiary" />
      <p className="text-sm text-text-secondary">Monday not configured.</p>
      <p className="mt-1 text-xs text-text-muted">
        {detail}. Set the env var and redeploy to light up the queue.
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
