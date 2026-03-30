'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';

type RoutingGroup = {
  id: string;
  title: string;
  description: string;
  tier: 'premium' | 'standard' | 'utility';
  chain: string[];
  effectiveChain: string[];
  features: string[];
};

type RoutingSummary = {
  configured: {
    default: {
      primary: string;
      fallbacks: string[];
    };
    topicSearch: {
      planner: string;
      research: string;
      merger: string;
      plannerChain: string[];
      researchChain: string[];
      mergerChain: string[];
    };
    ideas: {
      override: string;
      chain: string[];
    };
    agents: {
      model: string;
      provider: string;
      prefersOpenAi: boolean;
      hasOpenAiKey: boolean;
      chain: string[];
    };
  };
  policyGroups: RoutingGroup[];
};

function formatModelName(model: string): string {
  return model || 'Not configured';
}

function Chain({ models }: { models: string[] }) {
  if (models.length === 0) {
    return <span className="text-text-muted">Not configured</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {models.map((model, index) => (
        <div key={`${model}-${index}`} className="flex items-center gap-2">
          <span className="rounded-md border border-nativz-border bg-surface-hover/40 px-2 py-1 font-mono text-text-secondary">
            {model}
          </span>
          {index < models.length - 1 ? <span className="text-text-muted">→</span> : null}
        </div>
      ))}
    </div>
  );
}

const TIER_LABELS: Record<RoutingGroup['tier'], string> = {
  premium: 'Premium',
  standard: 'Standard',
  utility: 'Utility',
};

export function AiRoutingSummarySection() {
  const [data, setData] = useState<RoutingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/settings/ai-routing-summary');
        if (!res.ok) throw new Error('Failed to load routing summary');
        const json = (await res.json()) as RoutingSummary;
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load routing summary');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  return (
    <Card>
      <div className="space-y-6">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Resolved routing</h2>
          <p className="mt-1 text-xs text-text-muted">
            Effective chains the app will try by workload, including built-in policy tiers and special overrides.
          </p>
        </div>

        {loading ? (
          <div className="space-y-3">
            <div className="h-12 animate-pulse rounded-lg bg-surface-hover" />
            <div className="h-12 animate-pulse rounded-lg bg-surface-hover" />
            <div className="h-12 animate-pulse rounded-lg bg-surface-hover" />
          </div>
        ) : error || !data ? (
          <p className="text-xs text-red-400">{error ?? 'Failed to load routing summary'}</p>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="space-y-3 rounded-xl border border-nativz-border/70 bg-surface-hover/20 p-4">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">Default chain</h3>
                  <p className="mt-1 text-sm text-text-primary">{formatModelName(data.configured.default.primary)}</p>
                </div>
                <Chain models={[data.configured.default.primary, ...data.configured.default.fallbacks].filter(Boolean)} />
              </section>

              <section className="space-y-3 rounded-xl border border-nativz-border/70 bg-surface-hover/20 p-4">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">Agents</h3>
                  <p className="mt-1 text-sm text-text-primary">
                    {formatModelName(data.configured.agents.model)}{' '}
                    <span className="text-text-muted">via {data.configured.agents.provider}</span>
                  </p>
                </div>
                <Chain models={data.configured.agents.chain} />
              </section>

              <section className="space-y-3 rounded-xl border border-nativz-border/70 bg-surface-hover/20 p-4 lg:col-span-2">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">Topic search</h3>
                  <p className="mt-1 text-xs text-text-muted">
                    Planner, research, and merger keep their own chains on top of the policy fallback.
                  </p>
                </div>
                <div className="grid gap-3 lg:grid-cols-3">
                  <div className="space-y-2 rounded-lg border border-nativz-border/60 bg-background/50 p-3">
                    <p className="text-xs font-medium text-text-secondary">Planner</p>
                    <Chain models={data.configured.topicSearch.plannerChain} />
                  </div>
                  <div className="space-y-2 rounded-lg border border-nativz-border/60 bg-background/50 p-3">
                    <p className="text-xs font-medium text-text-secondary">Research</p>
                    <Chain models={data.configured.topicSearch.researchChain} />
                  </div>
                  <div className="space-y-2 rounded-lg border border-nativz-border/60 bg-background/50 p-3">
                    <p className="text-xs font-medium text-text-secondary">Merger</p>
                    <Chain models={data.configured.topicSearch.mergerChain} />
                  </div>
                </div>
              </section>

              <section className="space-y-3 rounded-xl border border-nativz-border/70 bg-surface-hover/20 p-4 lg:col-span-2">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">Content ideas</h3>
                  <p className="mt-1 text-xs text-text-muted">
                    Optional override first, then the premium policy chain and global default.
                  </p>
                </div>
                <Chain models={data.configured.ideas.chain} />
              </section>
            </div>

            <section className="space-y-3">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">Policy tiers</h3>
                <p className="mt-1 text-xs text-text-muted">
                  These chains apply automatically across the app based on feature importance.
                </p>
              </div>

              <div className="grid gap-4">
                {data.policyGroups.map((group) => (
                  <div key={group.id} className="rounded-xl border border-nativz-border/70 bg-surface-hover/20 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-medium text-text-primary">{group.title}</h4>
                        <p className="mt-1 text-xs text-text-muted">{group.description}</p>
                      </div>
                      <span className="rounded-full border border-nativz-border px-2 py-1 text-[11px] uppercase tracking-wider text-text-secondary">
                        {TIER_LABELS[group.tier]}
                      </span>
                    </div>
                    <div className="mt-3 space-y-3">
                      <Chain models={group.effectiveChain} />
                      <p className="text-xs text-text-muted">
                        Features: {group.features.join(', ')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </Card>
  );
}
