'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Loader2, Minus, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import {
  ReferenceVideosField,
  processPendingReferenceVideos,
  completedReferenceVideoIds,
  type ReferenceVideoItem,
} from './reference-videos-field';
import type { Pillar } from './pillar-card';

interface PillarIdeaConfigProps {
  clientId: string;
  pillars: Pillar[];
  initialSearchId?: string | null;
  /** Called when idea generation is accepted (before redirect). */
  onIdeasStarted?: () => void;
}

// ── Ideas Per Pillar Selector ────────────────────────────────────────────────

function IdeasPerPillarSelector({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const presets = [3, 5, 10];

  return (
    <div className="space-y-1.5">
      <span className="block text-sm font-medium text-text-secondary">Ideas per pillar</span>
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
                  ? 'bg-accent2 text-white shadow-sm'
                  : 'border border-nativz-border bg-surface text-text-secondary hover:bg-surface-hover'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <button
          onClick={() => onChange(Math.min(25, value + 1))}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-nativz-border bg-surface text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
        >
          <Plus size={14} />
        </button>
        {!presets.includes(value) && (
          <span className="ml-1 text-sm font-medium text-accent2-text tabular-nums">{value}</span>
        )}
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export function PillarIdeaConfig({ clientId, pillars, initialSearchId, onIdeasStarted }: PillarIdeaConfigProps) {
  const router = useRouter();
  const [ideasPerPillar, setIdeasPerPillar] = useState(5);
  const [concept, setConcept] = useState('');
  const [generating, setGenerating] = useState(false);
  const [processingRefs, setProcessingRefs] = useState(false);
  const [referenceVideos, setReferenceVideos] = useState<ReferenceVideoItem[]>([]);

  const totalIdeas = ideasPerPillar * pillars.length;
  const completedRefIds = completedReferenceVideoIds(referenceVideos);

  const handleGenerate = useCallback(async () => {
    if (!clientId || pillars.length === 0) return;
    const hasPendingUrl = referenceVideos.some((v) => v.status === 'pending' && v.url);
    let refIds = completedRefIds;
    if (hasPendingUrl) {
      setProcessingRefs(true);
      const finalItems = await processPendingReferenceVideos(clientId, referenceVideos, setReferenceVideos);
      setProcessingRefs(false);
      refIds = completedReferenceVideoIds(finalItems);
    }

    setGenerating(true);

    try {
      const res = await fetch('/api/ideas/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          pillar_ids: pillars.map((p) => p.id),
          ideas_per_pillar: ideasPerPillar,
          concept: concept.trim() || undefined,
          count: totalIdeas,
          search_id: initialSearchId ?? undefined,
          reference_video_ids: refIds.length > 0 ? refIds : undefined,
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: 'Failed to generate ideas' }));
        throw new Error(d.error ?? 'Failed to generate ideas');
      }

      const data = await res.json();
      onIdeasStarted?.();
      router.push(`/admin/ideas/${data.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate ideas');
      setGenerating(false);
    }
  }, [clientId, pillars, ideasPerPillar, concept, totalIdeas, initialSearchId, router, referenceVideos, completedRefIds, onIdeasStarted]);

  return (
    <div className="space-y-6">
      {/* Config form */}
      <div className="rounded-2xl border border-nativz-border bg-surface p-5 space-y-5">
        {/* Ideas per pillar + Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4 items-end">
          <IdeasPerPillarSelector value={ideasPerPillar} onChange={setIdeasPerPillar} />

          <div className="flex items-end pb-1">
            <p className="text-sm text-text-secondary">
              <span className="text-accent2-text font-medium">{ideasPerPillar}</span> ideas{' '}
              <span className="text-text-muted">&times;</span>{' '}
              <span className="text-accent2-text font-medium">{pillars.length}</span> pillar{pillars.length !== 1 ? 's' : ''}{' '}
              <span className="text-text-muted">=</span>{' '}
              <span className="text-text-primary font-semibold">{totalIdeas}</span> total ideas
            </p>
          </div>
        </div>

        {/* Pillar summary */}
        <div className="space-y-2">
          <span className="block text-sm font-medium text-text-secondary">Pillars</span>
          <div className="flex flex-wrap gap-1.5">
            {pillars.map((p) => (
              <Badge key={p.id} variant="purple">
                {p.emoji && <span className="mr-1">{p.emoji}</span>}
                {p.name}
              </Badge>
            ))}
          </div>
        </div>

        {/* Concept direction */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">
            Concept direction <span className="text-text-muted font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !generating) {
                e.preventDefault();
                handleGenerate();
              }
            }}
            placeholder="e.g. summer fitness tips, behind the scenes, product launches…"
            className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent2/50 focus:ring-1 focus:ring-accent2/50 transition-colors"
          />
        </div>

        <ReferenceVideosField
          items={referenceVideos}
          setItems={setReferenceVideos}
          disabled={generating || processingRefs}
        />

        {/* Generate button */}
        <div className="flex items-center justify-center pt-2">
          <button
            onClick={handleGenerate}
            disabled={generating || processingRefs || pillars.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent2 px-8 py-3 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer"
          >
            {generating || processingRefs ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {processingRefs ? 'Processing references…' : `Generating ${totalIdeas} ideas...`}
              </>
            ) : (
              <>
                <Sparkles size={16} />
                Generate {totalIdeas} ideas
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
