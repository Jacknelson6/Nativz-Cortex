'use client';

import { useCallback, useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { AdConcept } from './ad-concept-gallery';

interface Props {
  clientId: string;
  /** Called with the newly-generated concepts so the parent workspace can
   *  prepend them to the gallery without a round-trip refetch. */
  onBatchComplete: (concepts: AdConcept[]) => void;
  /** Switch the workspace to the gallery tab when a batch lands. */
  onSwitchToGallery: () => void;
}

const COUNT_PRESETS = [5, 10, 20, 30];
const DEFAULT_COUNT = 20;

const EXAMPLE_PROMPTS: string[] = [
  'Generate ads that emphasize testimonials and social proof. Cycle through review cards, testimonial stacks, and problem/solution framings.',
  'Focus on the current offer — build urgency without being salesy. Mix stat callouts with comparison framings.',
  'Lead with customer pain points pulled from the reviews in the asset library. Each concept should quote a reviewer directly where possible.',
];

/**
 * Chat intake for the Ad Generator. Admin types a direction ("make 20 ads
 * emphasizing testimonials"), picks a count, and fires a batch. The
 * backend runs everything — brand DNA lookup, asset + template manifest
 * assembly, OpenRouter call, concept insert — in one round-trip. On
 * success we prepend the new concepts to the gallery and switch tabs.
 *
 * Multi-turn conversation state lives in Phase 2b; this component is a
 * single-shot "submit direction → get batch" loop for now. That's all we
 * need to prove the generation pipeline end-to-end.
 */
export function AdGeneratorChat({ clientId, onBatchComplete, onSwitchToGallery }: Props) {
  const [prompt, setPrompt] = useState('');
  const [count, setCount] = useState<number>(DEFAULT_COUNT);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    const trimmed = prompt.trim();
    if (trimmed.length < 3) {
      toast.error('Give the generator a direction first');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/ad-creatives/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, prompt: trimmed, count }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast.error(body?.error ?? `Generation failed (${res.status})`);
        return;
      }
      const data = (await res.json()) as {
        batchId: string;
        status: 'completed' | 'partial' | 'failed';
        concepts: AdConcept[];
      };
      if (!data.concepts || data.concepts.length === 0) {
        toast.error('Model returned no concepts. Try a sharper direction.');
        return;
      }
      onBatchComplete(data.concepts);
      const verb = data.status === 'partial' ? 'Returned' : 'Generated';
      toast.success(`${verb} ${data.concepts.length} concept${data.concepts.length === 1 ? '' : 's'}`);
      onSwitchToGallery();
      setPrompt('');
    } finally {
      setSubmitting(false);
    }
  }, [clientId, count, prompt, onBatchComplete, onSwitchToGallery]);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-nativz-border bg-surface p-5">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
          <Sparkles size={12} />
          Direction
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              void handleSubmit();
            }
          }}
          rows={5}
          disabled={submitting}
          placeholder="Describe the batch you want. Templates to lean on, asset kinds to emphasize, offers to highlight, tone direction. The backend will ground every concept in brand DNA + the asset library + extracted templates."
          className="w-full resize-y rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm leading-relaxed text-text-primary placeholder:text-text-muted focus:border-accent/40 focus:outline-none"
        />

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">Count</span>
            <div className="inline-flex rounded-lg bg-surface-hover/60 p-0.5">
              {COUNT_PRESETS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCount(n)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
                    count === n
                      ? 'bg-accent text-white shadow-sm'
                      : 'text-text-muted hover:text-text-secondary'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || prompt.trim().length < 3}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {submitting ? `Generating ${count}…` : `Generate ${count} concepts`}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-text-muted/70">
          ⌘↵ submits. Generation typically takes 10–30 seconds depending on the count.
        </p>
      </div>

      <div className="rounded-xl border border-dashed border-nativz-border bg-surface/30 p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
          Example directions
        </p>
        <div className="space-y-2">
          {EXAMPLE_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPrompt(p)}
              disabled={submitting}
              className="block w-full cursor-pointer rounded-lg border border-nativz-border/40 bg-background/60 px-3 py-2 text-left text-xs leading-relaxed text-text-secondary transition-colors hover:border-accent/40 hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
