'use client';

import { useState } from 'react';
import { Sparkles, Loader2, RefreshCw } from 'lucide-react';
import type { GeneratedIdea } from '@/lib/knowledge/idea-generator';
import { IdeaCard } from './IdeaCard';

interface IdeaGeneratorProps {
  clientId: string;
  clientName: string;
}

export function IdeaGenerator({ clientId, clientName }: IdeaGeneratorProps) {
  const [concept, setConcept] = useState('');
  const [count, setCount] = useState(10);
  const [ideas, setIdeas] = useState<GeneratedIdea[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/knowledge/generate-ideas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concept: concept.trim() || undefined,
          count,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to generate ideas' }));
        throw new Error(data.error ?? 'Failed to generate ideas');
      }
      const data = await res.json();
      setIdeas(data.ideas ?? data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-surface rounded-xl border border-nativz-border p-5">
        <h2 className="text-lg font-semibold text-text-primary mb-1">Idea generator</h2>
        <p className="text-sm text-text-secondary mb-4">
          Generate video ideas for {clientName} using AI-powered context from their brand profile, past research, and content history.
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !loading) {
                e.preventDefault();
                handleGenerate();
              }
            }}
            placeholder="e.g. summer fitness tips, behind the scenes…"
            className="flex-1 rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 focus:shadow-[0_0_0_3px_rgba(168,85,247,0.15)] transition-colors"
          />

          <input
            type="number"
            min={1}
            max={50}
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
            className="w-24 rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 focus:shadow-[0_0_0_3px_rgba(168,85,247,0.15)] transition-colors"
            placeholder="# ideas"
          />

          <button
            onClick={handleGenerate}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-purple-500 px-5 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Sparkles size={16} />
                Generate
              </>
            )}
          </button>
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-400">{error}</p>
        )}
      </div>

      {/* Loading state */}
      {loading && ideas.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-purple-400 mb-3" />
          <p className="text-sm text-text-muted">Generating ideas for {clientName}…</p>
          <p className="text-[11px] text-text-muted/60 mt-1">This usually takes 10–20 seconds</p>
        </div>
      )}

      {/* Results */}
      {ideas.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-text-secondary">
              {ideas.length} idea{ideas.length !== 1 ? 's' : ''} generated
            </h2>
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="inline-flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-400/80 transition-colors cursor-pointer disabled:opacity-40"
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Regenerate
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ideas.map((idea, i) => (
              <IdeaCard key={`${idea.title}-${i}`} idea={idea} clientId={clientId} />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && ideas.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface border border-nativz-border mb-4">
            <Sparkles size={24} className="text-text-muted" />
          </div>
          <p className="text-sm text-text-muted">Enter an optional concept direction and hit generate</p>
        </div>
      )}
    </div>
  );
}
