'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Building2, Clock, Tag, FileText, Bookmark,
  ChevronRight, Sparkles, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { formatRelativeTime } from '@/lib/utils/format';
import { ComboSelect } from '@/components/ui/combo-select';
import { ContentWizard } from './content-wizard';

// ── Types ───────────────────────────────────────────────────────────────────

interface SavedIdea {
  id: string;
  client_id: string;
  title: string;
  content: string;
  metadata: Record<string, unknown> | null;
  source: string;
  created_at: string;
}

interface Client {
  id: string;
  name: string;
}

interface IdeasHubViewProps {
  initialIdeas: SavedIdea[];
  clients: Client[];
  searchId?: string | null;
  searchQuery?: string | null;
  /** Pre-selected client (merged from `?clientId=` or topic search on the server). */
  initialClientId?: string | null;
  /** Deep link from Strategy lab: `?focus=pillars|ideas|pillar-ideas`. */
  initialFocus?: 'pillars' | 'ideas' | 'pillar-ideas' | null;
}

// ── Mini Generator (inside client drawer) ───────────────────────────────────

function MiniGenerator({ clientId, onGenerated }: { clientId: string; onGenerated: () => void }) {
  const [concept, setConcept] = useState('');
  const [generating, setGenerating] = useState(false);

  const handleQuickGenerate = async () => {
    if (!clientId) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/ideas/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          concept: concept.trim() || undefined,
          count: 5,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      const ideas = data.ideas ?? [];

      // Auto-save all generated ideas
      for (const idea of ideas) {
        await fetch(`/api/clients/${clientId}/knowledge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'idea',
            title: idea.title,
            content: idea.why_it_works,
            metadata: { content_pillar: idea.content_pillar, source: 'ideas_hub' },
            source: 'generated',
          }),
        }).catch(() => {});
      }

      toast.success(`${ideas.length} ideas generated and saved`);
      setConcept('');
      onGenerated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-nativz-border">
      <Sparkles size={14} className="text-accent2-text shrink-0" />
      <input
        type="text"
        value={concept}
        onChange={(e) => setConcept(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !generating) {
            e.preventDefault();
            handleQuickGenerate();
          }
        }}
        placeholder="Quick generate 5 ideas (optional direction)…"
        className="flex-1 rounded-lg border border-nativz-border bg-background px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent2/50 focus:ring-1 focus:ring-accent2/50 transition-colors"
      />
      <button
        onClick={handleQuickGenerate}
        disabled={generating}
        className="inline-flex items-center gap-1.5 rounded-lg bg-accent2 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40 cursor-pointer transition-opacity shrink-0"
      >
        {generating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
        Generate
      </button>
    </div>
  );
}

// ── Client Section (expandable) ─────────────────────────────────────────────

function ClientSection({
  client,
  ideas,
  isOpen,
  onToggle,
  onRefresh,
}: {
  client: Client;
  ideas: SavedIdea[];
  isOpen: boolean;
  onToggle: () => void;
  onRefresh: () => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-nativz-border bg-surface overflow-hidden transition-all">
      {/* Client header — always visible */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-hover transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <Building2 size={16} className="text-text-muted" />
          <span className="text-sm font-semibold text-text-primary">{client.name}</span>
          <span className="text-[11px] text-text-muted rounded-full bg-background border border-nativz-border px-2 py-0.5">
            {ideas.length} {ideas.length === 1 ? 'idea' : 'ideas'}
          </span>
        </div>
        <ChevronRight
          size={16}
          className={`text-text-muted transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
        />
      </button>

      {/* Expanded content */}
      {isOpen && (
        <div className="px-4 pb-4 space-y-2">
          {ideas.length === 0 ? (
            <p className="text-xs text-text-muted py-2">No saved ideas yet for this client.</p>
          ) : (
            ideas.map((idea, index) => {
              const meta = idea.metadata as { content_pillar?: string } | null;
              const isExpanded = expandedId === idea.id;
              const hasScript = idea.content.includes('---\n\nScript:');
              const parts = idea.content.split('---\n\nScript:\n');
              const description = parts[0]?.trim() ?? '';
              const script = parts[1]?.trim();

              return (
                <Card
                  key={idea.id}
                  interactive
                  className="py-2.5 px-3.5 cursor-pointer animate-stagger-in"
                  style={{ animationDelay: `${index * 20}ms` }}
                  onClick={() => setExpandedId(isExpanded ? null : idea.id)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text-primary truncate">{idea.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-text-muted flex items-center gap-1">
                          <Clock size={10} />
                          {formatRelativeTime(idea.created_at)}
                        </span>
                        {meta?.content_pillar && (
                          <span className="text-[11px] text-text-muted flex items-center gap-1">
                            <Tag size={10} />
                            {meta.content_pillar}
                          </span>
                        )}
                        {hasScript && (
                          <span className="text-[10px] text-accent2-text flex items-center gap-1">
                            <FileText size={10} />
                            Script
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-2.5 pt-2.5 border-t border-nativz-border space-y-2.5">
                      <p className="text-xs text-text-secondary leading-relaxed">{description}</p>
                      {script && (
                        <div>
                          <p className="text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1">Script</p>
                          <div className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap rounded-lg bg-background border border-nativz-border p-3 font-mono max-h-48 overflow-y-auto">
                            {script}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })
          )}

          {/* Mini generator */}
          <MiniGenerator clientId={client.id} onGenerated={onRefresh} />
        </div>
      )}
    </div>
  );
}

// ── Main View ───────────────────────────────────────────────────────────────

export function IdeasHubView({
  initialIdeas,
  clients,
  searchId,
  searchQuery,
  initialClientId,
  initialFocus,
}: IdeasHubViewProps) {
  const [ideas, setIdeas] = useState(initialIdeas);
  const [openClientId, setOpenClientId] = useState<string | null>(null);

  const ideasByClient = useMemo(() => {
    const map = new Map<string, SavedIdea[]>();
    for (const idea of ideas) {
      if (!map.has(idea.client_id)) map.set(idea.client_id, []);
      map.get(idea.client_id)!.push(idea);
    }
    return map;
  }, [ideas]);

  // Sort clients: those with ideas first, then alphabetically
  const sortedClients = useMemo(() => {
    return [...clients].sort((a, b) => {
      const aCount = ideasByClient.get(a.id)?.length ?? 0;
      const bCount = ideasByClient.get(b.id)?.length ?? 0;
      if (aCount > 0 && bCount === 0) return -1;
      if (aCount === 0 && bCount > 0) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [clients, ideasByClient]);

  const handleRefresh = useCallback(async () => {
    try {
      const res = await fetch('/api/ideas/saved');
      if (res.ok) {
        const data = await res.json();
        setIdeas(data.ideas ?? []);
      }
    } catch {
      // Silently fail
    }
  }, []);

  return (
    <div className="cortex-page-gutter space-y-12">
      {/* Generator — centered like topic search */}
      <div className="flex flex-col items-center justify-center pt-8">
        <div className="w-full max-w-4xl">
          <ContentWizard
            key={`${searchId ?? ''}-${initialClientId ?? ''}-${initialFocus ?? ''}`}
            clients={clients}
            onIdeasSaved={handleRefresh}
            initialSearchId={searchId}
            initialSearchQuery={searchQuery}
            initialClientId={initialClientId ?? null}
            initialFocus={initialFocus ?? null}
          />
        </div>
      </div>

      {/* Client sections */}
      <div className="max-w-4xl mx-auto w-full">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Building2 size={18} className="text-accent2-text" />
            Clients
          </h2>
          <span className="text-sm text-text-muted">
            {ideas.length} saved {ideas.length === 1 ? 'idea' : 'ideas'} across {new Set(ideas.map((i) => i.client_id)).size} clients
          </span>
        </div>

        <div className="space-y-2">
          {sortedClients.map((client) => (
            <ClientSection
              key={client.id}
              client={client}
              ideas={ideasByClient.get(client.id) ?? []}
              isOpen={openClientId === client.id}
              onToggle={() => setOpenClientId(openClientId === client.id ? null : client.id)}
              onRefresh={handleRefresh}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
