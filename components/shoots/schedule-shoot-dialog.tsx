'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, Building2, X, ChevronDown } from 'lucide-react';
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
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [dropdownOpen]);

  function resetForm() {
    setTitle('');
    setShootDate('');
    setLocation('');
    setNotes('');
    setSelectedClientIds([]);
    setDropdownOpen(false);
  }

  function toggleClient(id: string) {
    setSelectedClientIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  }

  function removeClient(id: string) {
    setSelectedClientIds((prev) => prev.filter((c) => c !== id));
  }

  function selectAll() {
    setSelectedClientIds(clients.map((c) => c.id));
    setDropdownOpen(false);
  }

  const selectedClients = clients.filter((c) => selectedClientIds.includes(c.id));
  const unselectedClients = clients.filter((c) => !selectedClientIds.includes(c.id));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !shootDate) return;

    if (selectedClientIds.length === 0) {
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
          client_ids: selectedClientIds,
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
    <Dialog open={open} onClose={() => { resetForm(); onClose(); }} title="Schedule shoot" maxWidth="md">
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

        {/* Client selection — dropdown with pills */}
        <div>
          <label className="block text-xs font-medium text-text-muted mb-2">Clients</label>

          {/* Selected client pills */}
          {selectedClients.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {selectedClients.map((client) => (
                <span
                  key={client.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent-surface px-3 py-1.5 text-xs font-medium text-accent-text"
                >
                  <Building2 size={12} />
                  {client.name}
                  <button
                    type="button"
                    onClick={() => removeClient(client.id)}
                    className="cursor-pointer ml-0.5 rounded-full p-0.5 hover:bg-accent/20 transition-colors"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Dropdown trigger + menu */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="cursor-pointer inline-flex items-center gap-1.5 rounded-full border border-dashed border-nativz-border px-3 py-1.5 text-xs text-text-muted hover:border-text-muted hover:text-text-secondary transition-colors"
            >
              <Building2 size={12} />
              {selectedClients.length === 0 ? 'Select clients' : 'Add more'}
              <ChevronDown size={10} />
            </button>

            {dropdownOpen && (
              <div className="absolute left-0 top-full z-20 mt-1 min-w-[220px] max-h-48 overflow-y-auto rounded-lg border border-nativz-border bg-surface py-1 shadow-dropdown animate-fade-in">
                {/* Select all option */}
                {unselectedClients.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={selectAll}
                      className="cursor-pointer block w-full px-3 py-1.5 text-left text-xs font-medium text-accent-text hover:bg-surface-hover transition-colors"
                    >
                      Select all clients
                    </button>
                    <div className="mx-2 my-1 border-t border-nativz-border" />
                  </>
                )}
                {unselectedClients.length === 0 ? (
                  <p className="px-3 py-1.5 text-xs text-text-muted">All clients selected</p>
                ) : (
                  unselectedClients.map((client) => (
                    <button
                      key={client.id}
                      type="button"
                      onClick={() => toggleClient(client.id)}
                      className="cursor-pointer block w-full px-3 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-hover transition-colors"
                    >
                      {client.name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <Textarea
          id="shoot-notes"
          label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes for the crew..."
          rows={3}
        />

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={() => { resetForm(); onClose(); }}>
            Cancel
          </Button>
          <GlassButton
            type="submit"
            disabled={!title.trim() || !shootDate || selectedClientIds.length === 0 || submitting}
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
