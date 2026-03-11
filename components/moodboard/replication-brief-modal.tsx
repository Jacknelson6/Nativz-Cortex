'use client';

import { useState, useEffect } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { MoodboardItem } from '@/lib/types/moodboard';

interface RescriptModalProps {
  item: MoodboardItem;
  clientId: string | null;
  onClose: () => void;
  onSaved: (brief: string) => void;
}

interface ClientOption {
  id: string;
  name: string;
  industry: string;
}

export function ReplicationBriefModal({ item, clientId, onClose, onSaved }: RescriptModalProps) {
  const [selectedClientId, setSelectedClientId] = useState(clientId);
  const [notes, setNotes] = useState('');
  const [clients, setClients] = useState<ClientOption[]>([]);

  useEffect(() => {
    async function fetchClients() {
      const supabase = createClient();
      const { data } = await supabase
        .from('clients')
        .select('id, name, industry')
        .eq('is_active', true)
        .order('name');
      if (data) setClients(data);
    }
    fetchClients();
  }, []);

  function handleGenerate() {
    // Close immediately — generation runs in background
    const itemId = item.id;
    const itemTitle = item.title || 'Video';
    onClose();
    toast.info('Generating rescript...', { duration: 3000 });

    // Fire-and-forget
    fetch(`/api/moodboard/items/${itemId}/rescript`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: selectedClientId || undefined,
        notes: notes.trim() || undefined,
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to generate');
        }
        const data = await res.json();
        const brief = data.rescript?.script || data.rescript?.adapted_script || JSON.stringify(data.rescript, null, 2);
        onSaved(brief);
        toast.success('Rescript ready', {
          duration: 5000,
          action: {
            label: 'View',
            onClick: () => {
              // The onSaved callback already updates the item in state,
              // so clicking View just needs to open the analysis panel.
              // We dispatch a custom event the board page can listen to.
              window.dispatchEvent(new CustomEvent('open-analysis', { detail: { itemId } }));
            },
          },
        });
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Rescript failed');
      });
  }

  return (
    <Dialog
      open={true}
      onClose={onClose}
      title="Rescript video"
      maxWidth="md"
    >
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1.5">Client</label>
          <select
            value={selectedClientId || ''}
            onChange={(e) => setSelectedClientId(e.target.value || null)}
            className="cursor-pointer w-full rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30"
          >
            <option value="">No client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-text-muted mb-1.5">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any specific notes for this rescript?"
            rows={3}
            className="w-full rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none placeholder:text-text-muted"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleGenerate}>
            <Sparkles size={14} />
            Generate
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
