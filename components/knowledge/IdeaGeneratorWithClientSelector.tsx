'use client';

import { useState } from 'react';
import { Sparkles, Loader2, RefreshCw } from 'lucide-react';
import { ComboSelect } from '@/components/ui/combo-select';
import type { GeneratedIdea } from '@/lib/knowledge/idea-generator';
import { IdeaCard } from './IdeaCard';

interface Client {
  id: string;
  name: string;
}

interface IdeaGeneratorWithClientSelectorProps {
  clients: Client[];
}

export function IdeaGeneratorWithClientSelector({ clients }: IdeaGeneratorWithClientSelectorProps) {
  const [selectedClientId, setSelectedClientId] = useState('');
  const [concept, setConcept] = useState('');
  const [count, setCount] = useState(10);
  const [ideas, setIdeas] = useState<GeneratedIdea[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedClient = clients.find((c) => c.id === selectedClientId);

  const clientOptions = clients.map((c) => ({
    value: c.id,
    label: c.name,
  }));

  async function handleGenerate() {
    if (!selectedClientId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${selectedClientId}/knowledge/generate-ideas`, {
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
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-surface">
          <Sparkles size={20} className="text-accent-text" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Idea generator</h1>
          <p className="text-sm text-text-secondary">
            Generate AI-powered video ideas from brand context and research
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-surface rounded-xl border border-nativz-border p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
          <ComboSelect
            label="Client"
            options={clientOptions}
            value={selectedClientId}
            onChange={setSelectedClientId}
            placeholder="Search clients…"
            searchable
          />

          <div className="space-y-1.5">
            <span className="block text-sm font-medium text-text-secondary"># of ideas</span>
            <input
              type="number"
              min={1}
              max={50}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
              className="w-full sm:w-24 rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent focus:shadow-[0_0_0_3px_rgba(4,107,210,0.15)] transition-colors"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">
            Concept direction <span className="text-text-muted font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && selectedClientId && !loading) {
                e.preventDefault();
                handleGenerate();
              }
            }}
            placeholder="e.g. summer fitness tips, behind the scenes, product launches…"
            className="w-full rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent focus:shadow-[0_0_0_3px_rgba(4,107,210,0.15)] transition-colors"
          />
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={handleGenerate}
            disabled={loading || !selectedClientId}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent-text px-5 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Sparkles size={16} />
                Generate ideas
              </>
            )}
          </button>

          {selectedClient && !loading && (
            <span className="text-xs text-text-muted">
              for {selectedClient.name}
            </span>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}
      </div>

      {/* Results */}
      {loading && ideas.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-accent-text mb-3" />
          <p className="text-sm text-text-muted">Generating ideas for {selectedClient?.name}…</p>
          <p className="text-[11px] text-text-muted/60 mt-1">This usually takes 10–20 seconds</p>
        </div>
      )}

      {ideas.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-text-secondary">
              {ideas.length} idea{ideas.length !== 1 ? 's' : ''} generated
              {selectedClient && <span className="text-text-muted font-normal"> for {selectedClient.name}</span>}
            </h2>
            <button
              onClick={handleGenerate}
              disabled={loading || !selectedClientId}
              className="inline-flex items-center gap-1.5 text-xs text-accent-text hover:text-accent-text/80 transition-colors cursor-pointer disabled:opacity-40"
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Regenerate
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ideas.map((idea, i) => (
              <IdeaCard key={`${idea.title}-${i}`} idea={idea} clientId={selectedClientId} />
            ))}
          </div>
        </div>
      )}

      {!loading && ideas.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface border border-nativz-border mb-4">
            <Sparkles size={24} className="text-text-muted" />
          </div>
          <p className="text-sm text-text-muted">
            {selectedClientId
              ? 'Enter an optional concept direction and hit generate'
              : 'Select a client to start generating ideas'}
          </p>
        </div>
      )}
    </div>
  );
}
