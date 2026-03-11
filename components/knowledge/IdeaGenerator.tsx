'use client';

import { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
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
            placeholder="e.g. summer fitness tips, behind the scenes..."
            className="flex-1 rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-1 focus:ring-accent-text"
          />

          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-text"
          >
            <option value={5}>5 ideas</option>
            <option value={10}>10 ideas</option>
            <option value={15}>15 ideas</option>
          </select>

          <button
            onClick={handleGenerate}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent-text px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Generating...
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

      {ideas.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ideas.map((idea, i) => (
            <IdeaCard key={`${idea.title}-${i}`} idea={idea} clientId={clientId} />
          ))}
        </div>
      ) : (
        !loading && (
          <div className="flex flex-col items-center justify-center py-16 text-text-secondary">
            <Sparkles size={32} className="mb-3 opacity-40" />
            <p className="text-sm">No ideas generated yet. Enter an optional concept and hit generate.</p>
          </div>
        )
      )}
    </div>
  );
}
