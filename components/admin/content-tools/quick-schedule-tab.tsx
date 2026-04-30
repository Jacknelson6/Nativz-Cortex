'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  CheckCircle2,
  ChevronRight,
  Clock3,
  Image as ImageIcon,
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
}

export function QuickScheduleTab() {
  const [items, setItems] = useState<ApprovedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);

  async function load() {
    setLoading(true);
    try {
      // Endpoint isn't wired yet (iter 14.4). For now we hit a known
      // 404 path so the "available" probe stays honest -- once the real
      // route lands we just swap the URL and the tab lights up.
      const res = await fetch('/api/admin/content-tools/quick-schedule', {
        cache: 'no-store',
      });
      if (res.status === 404) {
        setAvailable(false);
        setItems([]);
        return;
      }
      if (!res.ok) throw new Error('Failed to load Monday queue');
      const data = (await res.json()) as { items: ApprovedItem[] };
      setItems(data.items ?? []);
      setAvailable(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load queue');
      setAvailable(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-4">
      <PipelineExplainer />
      <ApprovedQueue
        items={items}
        loading={loading}
        available={available}
        onRefresh={() => void load()}
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
  available,
  onRefresh,
}: {
  items: ApprovedItem[];
  loading: boolean;
  available: boolean | null;
  onRefresh: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-nativz-border px-5 py-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-text-primary">
            Editor-approved queue
          </div>
          <div className="mt-0.5 text-xs text-text-muted">
            Pulled from Monday Content Calendars where the EM Approved label is set
          </div>
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
      {loading ? (
        <QueueSkeleton />
      ) : available === false ? (
        <ComingSoonState />
      ) : items.length === 0 ? (
        <EmptyQueue />
      ) : (
        <ul className="divide-y divide-nativz-border/60">
          {items.map((it) => (
            <li
              key={it.itemId}
              className="flex items-center justify-between gap-3 px-5 py-3"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-text-primary">
                  {it.itemName}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-text-muted">
                  <span>{it.groupName}</span>
                  {it.approvedAt && (
                    <>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1">
                        <Clock3 className="size-3" />
                        {formatRelative(it.approvedAt)}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <Button variant="outline" size="sm" disabled>
                Schedule
                <ChevronRight size={12} />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
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

function ComingSoonState() {
  return (
    <div className="px-5 py-10 text-center">
      <Wand2 className="mx-auto mb-3 h-7 w-7 text-text-tertiary" />
      <p className="text-sm text-text-secondary">Pipeline coming online.</p>
      <p className="mt-1 text-xs text-text-muted">
        Wiring the Monday pull, thumbnail extract, and caption pre-fill behind one button.
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
