'use client';

import { useState, useEffect } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { GlassButton } from '@/components/ui/glass-button';
import { Button } from '@/components/ui/button';
import { Copy, RotateCcw, Save, Loader2, FileText } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { MoodboardItem } from '@/lib/types/moodboard';

interface ReplicationBriefModalProps {
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

export function ReplicationBriefModal({ item, clientId, onClose, onSaved }: ReplicationBriefModalProps) {
  const [step, setStep] = useState<'configure' | 'generating' | 'result'>('configure');
  const [selectedClientId, setSelectedClientId] = useState(clientId);
  const [format, setFormat] = useState('Same as original');
  const [notes, setNotes] = useState('');
  const [brief, setBrief] = useState(item.replication_brief || '');
  const [clients, setClients] = useState<ClientOption[]>([]);

  // If brief already exists, show it
  useEffect(() => {
    if (item.replication_brief) {
      setBrief(item.replication_brief);
      setStep('result');
    }
  }, [item.replication_brief]);

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

  async function handleGenerate() {
    setStep('generating');
    try {
      const res = await fetch(`/api/moodboard/items/${item.id}/replicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: selectedClientId,
          format,
          notes: notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate brief');
      }

      const data = await res.json();
      setBrief(data.brief);
      setStep('result');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Generation failed');
      setStep('configure');
    } finally {
    }
  }

  function handleCopySection(text: string) {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  }

  function handleSave() {
    onSaved(brief);
    toast.success('Brief saved');
  }

  const formats = ['TikTok', 'Instagram Reel', 'YouTube Short', 'Facebook Video', 'Same as original'];

  return (
    <Dialog
      open={true}
      onClose={onClose}
      title={step === 'result' ? 'Replication brief' : 'Generate replication brief'}
      maxWidth="lg"
    >
      {step === 'configure' && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1.5">Client</label>
            <select
              value={selectedClientId || ''}
              onChange={(e) => setSelectedClientId(e.target.value || null)}
              className="w-full rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              <option value="">No client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-muted mb-1.5">Target format</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className="w-full rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              {formats.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-muted mb-1.5">Adaptation notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any specific changes or adaptations for this client?"
              rows={3}
              className="w-full rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <GlassButton onClick={handleGenerate}>
              <FileText size={14} />
              Generate brief
            </GlassButton>
          </div>
        </div>
      )}

      {step === 'generating' && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Loader2 size={24} className="animate-spin text-accent" />
          <p className="text-sm text-text-secondary">Generating replication brief...</p>
          <p className="text-xs text-text-muted">This may take 30–60 seconds</p>
        </div>
      )}

      {step === 'result' && brief && (
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Brief content */}
          <div className="rounded-lg border border-nativz-border bg-surface-hover/30 p-4 text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
            {brief}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-nativz-border sticky bottom-0 bg-surface py-3">
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => handleCopySection(brief)}>
                <Copy size={14} />
                Copy all
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setStep('configure'); setBrief(''); }}>
                <RotateCcw size={14} />
                Regenerate
              </Button>
            </div>
            <GlassButton onClick={handleSave}>
              <Save size={14} />
              Save brief
            </GlassButton>
          </div>
        </div>
      )}
    </Dialog>
  );
}
