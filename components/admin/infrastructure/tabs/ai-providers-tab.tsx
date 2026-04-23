import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { Stat } from '../stat';
import { INFRA_CACHE_TAG } from '../cache';

interface ProviderRollup {
  slug: string;
  label: string;
  calls7d: number;
  tokens7d: number;
  cost7d: number;
  cost24h: number;
  failures7d: number;
  avgLatencyMs: number | null;
  lastSeenAt: string | null;
}

function providerFromModel(model?: string | null): string {
  if (!model) return 'unknown';
  if (model.startsWith('openai/')) return 'openai';
  if (model.startsWith('anthropic/')) return 'anthropic';
  if (model.startsWith('google/') || model.startsWith('gemini/')) return 'google';
  if (model.startsWith('perplexity/')) return 'perplexity';
  if (model.startsWith('openrouter/')) return 'openrouter';
  if (model.includes('grok')) return 'grok';
  return model.split('/')[0] ?? 'unknown';
}

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google (Gemini)',
  perplexity: 'Perplexity',
  openrouter: 'OpenRouter',
  grok: 'Grok (xAI)',
  unknown: 'Unknown',
};

const getProviderRollup = unstable_cache(
  async () => {
    const admin = createAdminClient();
    const now = Date.now();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();

    // Two telemetry sources fuse here:
    //   1. `topic_searches.pipeline_state.stages[]` — per-stage model usage
    //      (gives us calls, latency, failures inside a pipeline).
    //   2. `api_usage_logs` — ground truth $ cost + tokens for every AI
    //      call (populated by lib/ai/usage.ts::logUsage). This is the
    //      right source for money — the pipeline_state.tokens field is
    //      estimate-only.
    const [topic, usage, usage24h] = await Promise.all([
      admin
        .from('topic_searches')
        .select('status, created_at, completed_at, processing_started_at, pipeline_state, tokens_used')
        .gte('created_at', sevenDaysAgo)
        .limit(1000),
      admin
        .from('api_usage_logs')
        .select('model, total_tokens, cost_usd')
        .gte('created_at', sevenDaysAgo)
        .limit(5000),
      admin
        .from('api_usage_logs')
        .select('model, cost_usd')
        .gte('created_at', twentyFourHoursAgo)
        .limit(5000),
    ]);

    const byProvider = new Map<string, ProviderRollup>();

    function ensure(slug: string): ProviderRollup {
      const existing = byProvider.get(slug);
      if (existing) return existing;
      const created: ProviderRollup = {
        slug,
        label: PROVIDER_LABELS[slug] ?? slug,
        calls7d: 0,
        tokens7d: 0,
        cost7d: 0,
        cost24h: 0,
        failures7d: 0,
        avgLatencyMs: null,
        lastSeenAt: null,
      };
      byProvider.set(slug, created);
      return created;
    }

    const latencyBuckets = new Map<string, number[]>();

    for (const row of topic.data ?? []) {
      const stages = (row.pipeline_state as { stages?: Array<{ model?: string; duration_ms?: number; error?: unknown }> } | null)?.stages ?? [];
      for (const stage of stages) {
        const provider = providerFromModel(stage.model);
        const bucket = ensure(provider);
        bucket.calls7d += 1;
        if (typeof stage.duration_ms === 'number') {
          const list = latencyBuckets.get(provider) ?? [];
          list.push(stage.duration_ms);
          latencyBuckets.set(provider, list);
        }
        if (stage.error) bucket.failures7d += 1;
      }
      const tokens = row.tokens_used ?? 0;
      if (tokens > 0) {
        // Attribute tokens to the most-used provider on that run (rough)
        const firstStageProvider = providerFromModel(stages[0]?.model);
        const bucket = ensure(firstStageProvider);
        bucket.tokens7d += tokens;
      }
      const lastSeen = row.completed_at ?? row.created_at;
      for (const stage of stages) {
        const provider = providerFromModel(stage.model);
        const bucket = ensure(provider);
        if (!bucket.lastSeenAt || (lastSeen && new Date(lastSeen) > new Date(bucket.lastSeenAt))) {
          bucket.lastSeenAt = lastSeen;
        }
      }
    }

    for (const [slug, times] of latencyBuckets.entries()) {
      const bucket = byProvider.get(slug);
      if (!bucket || times.length === 0) continue;
      bucket.avgLatencyMs = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    }

    // Fuse api_usage_logs cost + token totals into each provider bucket.
    for (const row of usage.data ?? []) {
      const provider = providerFromModel((row as { model?: string | null }).model);
      const bucket = ensure(provider);
      bucket.cost7d += Number((row as { cost_usd?: number | string | null }).cost_usd ?? 0);
      bucket.tokens7d += Number((row as { total_tokens?: number | null }).total_tokens ?? 0);
    }
    for (const row of usage24h.data ?? []) {
      const provider = providerFromModel((row as { model?: string | null }).model);
      const bucket = ensure(provider);
      bucket.cost24h += Number((row as { cost_usd?: number | string | null }).cost_usd ?? 0);
    }

    return [...byProvider.values()].sort((a, b) => b.cost7d - a.cost7d || b.calls7d - a.calls7d);
  },
  ['infrastructure-ai-providers'],
  { revalidate: 60, tags: [INFRA_CACHE_TAG] },
);

function formatTimestamp(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatUsd(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '$0.00';
  if (n < 0.01) return '<$0.01';
  if (n < 10) return `$${n.toFixed(2)}`;
  if (n < 1000) return `$${n.toFixed(0)}`;
  return `$${(n / 1000).toFixed(1)}k`;
}

export async function AiProvidersTab() {
  const providers = await getProviderRollup();

  const totalCalls = providers.reduce((acc, p) => acc + p.calls7d, 0);
  const totalTokens = providers.reduce((acc, p) => acc + p.tokens7d, 0);
  const totalCost7d = providers.reduce((acc, p) => acc + p.cost7d, 0);
  const totalCost24h = providers.reduce((acc, p) => acc + p.cost24h, 0);
  const totalFailures = providers.reduce((acc, p) => acc + p.failures7d, 0);

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Spend / 24h"
          value={formatUsd(totalCost24h)}
          sub={`${providers.length} provider${providers.length === 1 ? '' : 's'} in use`}
        />
        <Stat
          label="Spend / 7d"
          value={formatUsd(totalCost7d)}
          sub={`${totalCalls.toLocaleString()} calls`}
        />
        <Stat label="Tokens (7d)" value={totalTokens.toLocaleString()} />
        <Stat
          label="Failures (7d)"
          value={String(totalFailures)}
          sub={totalCalls > 0 ? `${Math.round((totalFailures / totalCalls) * 100)}% fail rate` : undefined}
        />
      </section>

      {providers.length === 0 ? (
        <div className="rounded-xl border border-nativz-border bg-surface p-6 text-sm text-text-muted">
          No provider telemetry in the last 7 days. Run a topic search to populate this tab.
        </div>
      ) : (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {providers.map((p) => (
            <div
              key={p.slug}
              className="rounded-xl border border-nativz-border bg-surface p-4 transition-colors hover:border-nativz-border/90"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-text-primary">{p.label}</h3>
                <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-cyan-300">
                  {p.slug}
                </span>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-text-muted">Spend 24h</dt>
                  <dd className="mt-0.5 tabular-nums text-text-primary">{formatUsd(p.cost24h)}</dd>
                </div>
                <div>
                  <dt className="text-text-muted">Spend 7d</dt>
                  <dd className="mt-0.5 tabular-nums font-semibold text-text-primary">
                    {formatUsd(p.cost7d)}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">Calls</dt>
                  <dd className="mt-0.5 tabular-nums text-text-primary">{p.calls7d.toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-text-muted">Tokens</dt>
                  <dd className="mt-0.5 tabular-nums text-text-primary">{p.tokens7d.toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-text-muted">Failures</dt>
                  <dd className={`mt-0.5 tabular-nums ${p.failures7d > 0 ? 'text-coral-300' : 'text-text-primary'}`}>
                    {p.failures7d}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">Avg latency</dt>
                  <dd className="mt-0.5 tabular-nums text-text-primary">
                    {p.avgLatencyMs != null ? `${(p.avgLatencyMs / 1000).toFixed(1)}s` : '—'}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-text-muted">Last seen</dt>
                  <dd className="mt-0.5 text-text-primary">{formatTimestamp(p.lastSeenAt)}</dd>
                </div>
              </dl>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
