'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, Plus, FolderInput, Clock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useActiveBrand } from '@/lib/admin/active-client-context';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { ContentDrop, DropStatus } from '@/lib/types/calendar';

export default function CalendarPage() {
  const router = useRouter();
  const { brand } = useActiveBrand();
  const [drops, setDrops] = useState<ContentDrop[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    const clientId = brand?.id;
    if (!clientId) {
      setDrops([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/calendar/drops?clientId=${clientId}`);
        const data = await res.json();
        if (!cancelled) setDrops(data.drops ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [brand?.id]);

  return (
    <div className="cortex-page-gutter max-w-6xl mx-auto space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div className="min-w-0 shrink">
          <h1 className="text-2xl font-semibold text-text-primary">Content calendar</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Paste a Drive folder of content, get scheduled posts and a client share link.
          </p>
        </div>
        {brand && (
          <Button onClick={() => setShowNew(true)}>
            <Plus size={16} />
            New content calendar
          </Button>
        )}
      </header>

      {!brand && (
        <div className="rounded-xl border border-nativz-border bg-surface p-12 text-center">
          <CalendarDays className="mx-auto mb-3 h-8 w-8 text-text-tertiary" />
          <p className="text-sm text-text-secondary">Pick a brand from the top bar to get started.</p>
        </div>
      )}

      {brand && loading && (
        <div className="rounded-xl border border-nativz-border bg-surface p-12 text-center text-sm text-text-secondary">
          Loading content calendars…
        </div>
      )}

      {brand && !loading && drops.length === 0 && (
        <div className="rounded-xl border border-nativz-border bg-surface p-12 text-center">
          <CalendarDays className="mx-auto mb-3 h-8 w-8 text-text-tertiary" />
          <p className="text-sm text-text-secondary">No content calendars yet for {brand.name}.</p>
          <p className="mt-1 text-xs text-text-muted">
            Click <span className="text-text-secondary">New content calendar</span> to add your first batch of content.
          </p>
        </div>
      )}

      {brand && !loading && drops.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {drops.map((d) => (
            <DropCard key={d.id} drop={d} />
          ))}
        </div>
      )}

      {brand && (
        <NewDropDialog
          open={showNew}
          onClose={() => setShowNew(false)}
          clientId={brand.id}
          onCreated={(id) => {
            setShowNew(false);
            toast.success('Content calendar created — analysing content…');
            router.push(`/admin/calendar/${id}`);
          }}
        />
      )}
    </div>
  );
}

function DropCard({ drop }: { drop: ContentDrop }) {
  return (
    <a
      href={`/admin/calendar/${drop.id}`}
      className="block rounded-xl border border-nativz-border bg-surface p-4 transition-colors hover:bg-surface-hover"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary">
            {drop.start_date} → {drop.end_date}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            {drop.processed_videos}/{drop.total_videos} videos · default {drop.default_post_time}
          </p>
        </div>
        <StatusBadge status={drop.status} />
      </div>
      {drop.error_detail && (
        <p className="mt-2 text-xs text-red-400">{drop.error_detail}</p>
      )}
    </a>
  );
}

const STATUS_LABEL: Record<DropStatus, string> = {
  ingesting: 'Ingesting',
  analyzing: 'Analysing',
  generating: 'Captioning',
  ready: 'Ready',
  scheduled: 'Scheduled',
  failed: 'Failed',
};

const STATUS_TONE: Record<DropStatus, string> = {
  ingesting: 'bg-blue-500/10 text-blue-300',
  analyzing: 'bg-blue-500/10 text-blue-300',
  generating: 'bg-blue-500/10 text-blue-300',
  ready: 'bg-amber-500/10 text-amber-300',
  scheduled: 'bg-emerald-500/10 text-emerald-300',
  failed: 'bg-red-500/10 text-red-300',
};

function StatusBadge({ status }: { status: DropStatus }) {
  const inFlight = status === 'ingesting' || status === 'analyzing' || status === 'generating';
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[status]}`}
    >
      {inFlight && <Loader2 size={10} className="animate-spin" />}
      {STATUS_LABEL[status]}
    </span>
  );
}

interface NewDropDialogProps {
  open: boolean;
  onClose: () => void;
  clientId: string;
  onCreated: (id: string) => void;
}

function NewDropDialog({ open, onClose, clientId, onCreated }: NewDropDialogProps) {
  const today = new Date().toISOString().slice(0, 10);
  const weekLater = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [folderUrl, setFolderUrl] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(weekLater);
  const [defaultTime, setDefaultTime] = useState('10:00');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setFolderUrl('');
      setSubmitting(false);
    }
  }, [open]);

  async function handleCreate() {
    if (!folderUrl.trim()) {
      toast.error('Drive folder URL required');
      return;
    }
    setSubmitting(true);
    let success = false;
    try {
      const res = await fetch('/api/calendar/drops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          driveFolderUrl: folderUrl.trim(),
          startDate,
          endDate,
          defaultPostTime: defaultTime,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Failed to create content calendar');
      success = true;
      onCreated(data.drop.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create content calendar');
    } finally {
      // Keep "Creating…" state on success — parent unmounts the dialog.
      if (!success) setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="New content calendar" maxWidth="lg">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-text-secondary">
            Google Drive folder
          </label>
          <div className="flex items-center gap-2 rounded-lg border border-nativz-border bg-surface px-3 py-2">
            <FolderInput size={14} className="shrink-0 text-text-muted" />
            <input
              value={folderUrl}
              onChange={(e) => setFolderUrl(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/…"
              className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-muted focus:outline-none"
              disabled={submitting}
            />
          </div>
          <p className="text-xs text-text-muted">
            The folder must be shared so your connected Google account can read it.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Start date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            disabled={submitting}
          />
          <Input
            label="End date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            disabled={submitting}
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-text-secondary">Default post time (UTC)</label>
          <div className="flex items-center gap-2 rounded-lg border border-nativz-border bg-surface px-3 py-2">
            <Clock size={14} className="shrink-0 text-text-muted" />
            <input
              type="time"
              value={defaultTime}
              onChange={(e) => setDefaultTime(e.target.value)}
              className="flex-1 bg-transparent text-sm text-text-primary focus:outline-none"
              disabled={submitting}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={submitting}>
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {submitting ? 'Creating…' : 'Create content calendar'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
