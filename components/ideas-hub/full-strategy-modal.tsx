'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ComboSelect } from '@/components/ui/combo-select';

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

      // If the API returns a redirect path, navigate there
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md rounded-2xl border border-nativz-border bg-surface p-6 shadow-elevated animate-fade-slide-in">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
        >
          <X size={16} />
        </button>

        {/* Header */}
        <div className="space-y-1 mb-6">
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

        {/* Form */}
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

          <button
            onClick={handleGenerate}
            disabled={generating || !clientId}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-accent2 px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer"
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
          </button>
        </div>
      </div>
    </div>
  );
}
