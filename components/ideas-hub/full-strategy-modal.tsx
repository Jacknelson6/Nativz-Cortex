'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ComboSelect } from '@/components/ui/combo-select';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface FullStrategyModalProps {
  open: boolean;
  onClose: () => void;
  clients: { id: string; name: string }[];
}

export function FullStrategyModal({ open, onClose, clients }: FullStrategyModalProps) {
  const router = useRouter();
  const [clientId, setClientId] = useState('');
  const [direction, setDirection] = useState('');
  const [generating, setGenerating] = useState(false);

  const clientOptions = clients.map((c) => ({ value: c.id, label: c.name }));

  const handleGenerate = async () => {
    if (!clientId) return;
    setGenerating(true);

    try {
      const res = await fetch(`/api/clients/${clientId}/pillars/generate-strategy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          direction: direction.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: 'Failed to start strategy generation' }));
        throw new Error(d.error ?? 'Failed to start strategy generation');
      }

      toast.success('Strategy generation started');
      onClose();

      const data = await res.json().catch(() => null);
      if (data?.redirect) {
        router.push(data.redirect);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate strategy');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="" maxWidth="md" bodyClassName="p-6">
      <div className="space-y-1 mb-6 pr-10">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent2-surface">
            <Sparkles size={16} className="text-accent2-text" />
          </div>
          <h2 className="text-lg font-semibold text-text-primary">Full strategy</h2>
        </div>
        <p className="text-xs text-text-secondary">
          Generate content pillars, ideas, and scripts in one go
        </p>
      </div>

      <div className="space-y-4">
        <ComboSelect
          label="Client"
          options={clientOptions}
          value={clientId}
          onChange={setClientId}
          placeholder="Search clients..."
          searchable
          accent="purple"
        />

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">
            Direction <span className="text-text-muted font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && clientId && !generating) {
                e.preventDefault();
                handleGenerate();
              }
            }}
            placeholder="e.g. focus on Q2 product launches…"
            className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent2/50 focus:ring-1 focus:ring-accent2/50 transition-colors"
          />
        </div>

        <Button
          onClick={handleGenerate}
          disabled={generating || !clientId}
          className="w-full"
        >
          {generating ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Generating strategy...
            </>
          ) : (
            <>
              <Sparkles size={16} />
              Generate full strategy
            </>
          )}
        </Button>
      </div>
    </Dialog>
  );
}
