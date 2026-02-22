'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { GlassButton } from '@/components/ui/glass-button';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

interface ClientOption {
  id: string;
  name: string;
}

interface ScheduleShootDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export function ScheduleShootDialog({ open, onClose, onCreated }: ScheduleShootDialogProps) {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [title, setTitle] = useState('');
  const [shootDate, setShootDate] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [clientMode, setClientMode] = useState<'all' | 'select'>('all');
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    async function fetchClients() {
      const supabase = createClient();
      const { data } = await supabase
        .from('clients')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      if (data) setClients(data);
    }
    fetchClients();
  }, [open]);

  function resetForm() {
    setTitle('');
    setShootDate('');
    setLocation('');
    setNotes('');
    setClientMode('all');
    setSelectedClientIds([]);
  }

  function toggleClient(id: string) {
    setSelectedClientIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !shootDate) return;

    const clientIds = clientMode === 'all' ? clients.map((c) => c.id) : selectedClientIds;
    if (clientIds.length === 0) {
      toast.error('Select at least one client.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/shoots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          shoot_date: shootDate,
          location: location.trim() || null,
          notes: notes.trim() || null,
          client_ids: clientIds,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to schedule shoot.');
        return;
      }

      const data = await res.json();
      toast.success(`Scheduled ${data.count} shoot event${data.count > 1 ? 's' : ''}`);
      resetForm();
      onClose();
      onCreated?.();
    } catch {
      toast.error('Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Schedule shoot" maxWidth="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="shoot-title"
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. March content day"
          required
        />

        <Input
          id="shoot-date"
          label="Date"
          type="date"
          value={shootDate}
          onChange={(e) => setShootDate(e.target.value)}
          required
        />

        <Input
          id="shoot-location"
          label="Location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Optional"
        />

        {/* Client selection */}
        <div>
          <label className="block text-xs font-medium text-text-muted mb-2">Clients</label>
          <div className="flex gap-3 mb-3">
            <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
              <input
                type="radio"
                name="client-mode"
                checked={clientMode === 'all'}
                onChange={() => setClientMode('all')}
                className="accent-accent"
              />
              All active clients
            </label>
            <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
              <input
                type="radio"
                name="client-mode"
                checked={clientMode === 'select'}
                onChange={() => setClientMode('select')}
                className="accent-accent"
              />
              Select specific
            </label>
          </div>

          {clientMode === 'select' && (
            <div className="max-h-40 overflow-y-auto space-y-1 rounded-lg border border-nativz-border bg-surface-hover p-2">
              {clients.length === 0 ? (
                <p className="text-xs text-text-muted px-2 py-1">No active clients</p>
              ) : (
                clients.map((client) => (
                  <label
                    key={client.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface transition-colors cursor-pointer text-sm text-text-secondary"
                  >
                    <input
                      type="checkbox"
                      checked={selectedClientIds.includes(client.id)}
                      onChange={() => toggleClient(client.id)}
                      className="accent-accent"
                    />
                    {client.name}
                  </label>
                ))
              )}
            </div>
          )}
        </div>

        <Textarea
          id="shoot-notes"
          label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes for the crew..."
          rows={3}
        />

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={() => { resetForm(); onClose(); }} className="flex-1">
            Cancel
          </Button>
          <GlassButton
            type="submit"
            disabled={!title.trim() || !shootDate || submitting}
            className="flex-[2]"
          >
            {submitting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Scheduling...
              </>
            ) : (
              'Schedule shoot'
            )}
          </GlassButton>
        </div>
      </form>
    </Dialog>
  );
}
