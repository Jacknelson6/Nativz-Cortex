'use client';

import { useEffect, useState } from 'react';
import { Clock, FolderInput, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface NewDropDialogProps {
  open: boolean;
  onClose: () => void;
  clientId: string | null;
  onCreated: (id: string) => void;
}

export function NewDropDialog({ open, onClose, clientId, onCreated }: NewDropDialogProps) {
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
    if (!clientId) {
      toast.error('Pick a brand first');
      return;
    }
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
      if (!success) setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="New content calendar from Drive" maxWidth="lg">
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
            The folder must be shared so your connected Google account can read it. We&rsquo;ll caption every video in the folder and schedule them across the date range.
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
          <Button onClick={handleCreate} disabled={submitting || !clientId}>
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {submitting ? 'Creating…' : 'Create content calendar'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
