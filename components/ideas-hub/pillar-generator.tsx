'use client';

import { useState, useCallback } from 'react';
import { Sparkles, Loader2, ArrowRight, Minus, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { PillarList } from './pillar-list';
import type { Pillar } from './pillar-card';

interface PillarGeneratorProps {
  clientId: string;
  pillars: Pillar[];
  onPillarsChange: (pillars: Pillar[]) => void;
  onNext: () => void;
}

// ── Count Selector ──────────────────────────────────────────────────────────

function PillarCountSelector({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const presets = [3, 5, 7];

  return (
    <div className="space-y-1.5">
      <span className="block text-sm font-medium text-text-secondary"># of pillars</span>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onChange(Math.max(1, value - 1))}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-nativz-border bg-surface text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
        >
          <Minus size={14} />
        </button>
        <div className="flex items-center gap-1">
          {presets.map((n) => (
            <button
              key={n}
              onClick={() => onChange(n)}
              className={`h-9 min-w-[2.25rem] rounded-lg px-2 text-sm font-medium transition-all cursor-pointer ${
                value === n
                  ? 'bg-purple-500 text-white shadow-sm'
                  : 'border border-nativz-border bg-surface text-text-secondary hover:bg-surface-hover'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <button
          onClick={() => onChange(Math.min(20, value + 1))}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-nativz-border bg-surface text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
        >
          <Plus size={14} />
        </button>
        {!presets.includes(value) && (
          <span className="ml-1 text-sm font-medium text-purple-400 tabular-nums">{value}</span>
        )}
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export function PillarGenerator({ clientId, pillars, onPillarsChange, onNext }: PillarGeneratorProps) {
  const [count, setCount] = useState(5);
  const [generating, setGenerating] = useState(false);
  const [pollMessage, setPollMessage] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!clientId) return;
    setGenerating(true);
    setPollMessage('Starting pillar generation...');

    try {
      // Kick off generation
      const res = await fetch(`/api/clients/${clientId}/pillars/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: 'Failed to start generation' }));
        throw new Error(d.error ?? 'Failed to start generation');
      }

      const data = await res.json();

      // If response includes pillars directly, use them
      if (data.pillars) {
        onPillarsChange(data.pillars);
        setPollMessage(null);
        toast.success(`${data.pillars.length} pillars generated`);
        setGenerating(false);
        return;
      }

      // Otherwise poll for completion
      const jobId = data.id;
      if (!jobId) throw new Error('No job ID returned');

      const pollInterval = setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/clients/${clientId}/pillars/generate/${jobId}`);
          if (!pollRes.ok) return;
          const pollData = await pollRes.json();

          const status = pollData.generation?.status ?? pollData.status;
          if (status === 'completed' && pollData.pillars) {
            clearInterval(pollInterval);
            onPillarsChange(pollData.pillars);
            setPollMessage(null);
            setGenerating(false);
            toast.success(`${pollData.pillars.length} pillars generated`);
          } else if (status === 'failed') {
            clearInterval(pollInterval);
            throw new Error(pollData.generation?.error_message ?? pollData.error ?? 'Generation failed');
          } else {
            setPollMessage('Generating pillars...');
          }
        } catch (err) {
          clearInterval(pollInterval);
          toast.error(err instanceof Error ? err.message : 'Polling failed');
          setGenerating(false);
          setPollMessage(null);
        }
      }, 3000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate pillars');
      setGenerating(false);
      setPollMessage(null);
    }
  }, [clientId, count, onPillarsChange]);

  return (
    <div className="space-y-6">
      {/* Generation controls */}
      <div className="rounded-2xl border border-nativz-border bg-surface p-5 space-y-5">
        <div className="flex items-end gap-4">
          <PillarCountSelector value={count} onChange={setCount} />
        </div>

        <div className="flex items-center justify-center">
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-purple-500 px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer"
          >
            {generating ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {pollMessage ?? 'Generating...'}
              </>
            ) : (
              <>
                <Sparkles size={16} />
                Generate pillars
              </>
            )}
          </button>
        </div>
      </div>

      {/* Loading state */}
      {generating && pillars.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 size={28} className="animate-spin text-purple-400 mb-3" />
          <p className="text-sm text-text-muted">{pollMessage ?? 'Generating pillars...'}</p>
          <p className="text-[11px] text-text-muted/60 mt-1">This usually takes 15-30 seconds</p>
        </div>
      )}

      {/* Pillar list */}
      {pillars.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-text-secondary">
              {pillars.length} pillar{pillars.length !== 1 ? 's' : ''}
            </h3>
          </div>

          <PillarList
            pillars={pillars}
            clientId={clientId}
            onPillarsChange={onPillarsChange}
          />
        </div>
      )}

      {/* Empty state */}
      {!generating && pillars.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface border border-nativz-border mb-4">
            <Sparkles size={24} className="text-text-muted" />
          </div>
          <p className="text-sm text-text-muted">Configure options above and generate content pillars</p>
        </div>
      )}

      {/* Next step CTA */}
      {pillars.length > 0 && (
        <div className="flex items-center justify-center pt-2">
          <button
            onClick={onNext}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-purple-500 px-8 py-3 text-sm font-semibold text-white hover:opacity-90 transition-opacity cursor-pointer"
          >
            Generate ideas from pillars
            <ArrowRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
