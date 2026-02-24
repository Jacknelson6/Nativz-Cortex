'use client';

import { useState, useEffect } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { GlassButton } from '@/components/ui/glass-button';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { MoodboardBoard } from '@/lib/types/moodboard';

interface CreateBoardModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (board: MoodboardBoard) => void;
}

interface ClientOption {
  id: string;
  name: string;
}

export function CreateBoardModal({ open, onClose, onCreated }: CreateBoardModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [clientId, setClientId] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(false);

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

  function reset() {
    setName('');
    setDescription('');
    setClientId(null);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    try {
      const res = await fetch('/api/moodboard/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          client_id: clientId || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create board');
      }

      const board = await res.json();
      toast.success('Board created');
      reset();
      onCreated(board);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create board');
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => { reset(); onClose(); }}
      title="New board"
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="board-name" className="block text-xs font-medium text-text-muted mb-1.5">
            Board name
          </label>
          <Input
            id="board-name"
            placeholder="e.g. Q1 video inspiration"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div>
          <label htmlFor="board-client" className="block text-xs font-medium text-text-muted mb-1.5">
            Client (optional)
          </label>
          <select
            id="board-client"
            value={clientId || ''}
            onChange={(e) => setClientId(e.target.value || null)}
            className="w-full rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30"
          >
            <option value="">No client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="board-desc" className="block text-xs font-medium text-text-muted mb-1.5">
            Description (optional)
          </label>
          <Input
            id="board-desc"
            placeholder="Short description..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => { reset(); onClose(); }}>
            Cancel
          </Button>
          <GlassButton type="submit" loading={loading} disabled={!name.trim()}>
            Create board
          </GlassButton>
        </div>
      </form>
    </Dialog>
  );
}
