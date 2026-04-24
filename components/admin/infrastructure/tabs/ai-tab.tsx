/**
 * Infrastructure › AI — providers + usage (merged).
 *
 * Replaces the old "AI providers" tab and absorbs what used to be the AI
 * settings "Usage" tab. The server-rendered provider roll-up stays visible
 * by default; the fine-grained UsageDashboard (by model / by user / daily
 * chart) lives behind a disclosure so the page stays scannable.
 */

import { unstable_cache } from 'next/cache';
import { Layers, TrendingUp } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { Stat } from '../stat';
import { Disclosure, SectionCard } from '../section-card';
import { INFRA_CACHE_TAG, INFRA_CACHE_TTL } from '../cache';
import { UsageDashboard } from '@/components/settings/usage-dashboard';

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

/**
 * Classify a model identifier into a provider bucket. Handles both the
 * canonical `provider/model` form (`anthropic/claude-sonnet-4-5`) and the
 * un-prefixed names we still emit from a few direct-SDK call sites
 * (`gemini-embedding-001`, `whisper-large-v3-turbo`, `gpt-4o-mini`).
 *
 * Order matters — most specific prefix wins.
 */
function providerFromModel(model?: string | null): string {
  if (!model) return 'unknown';
  const m = model.toLowerCase();

  // Canonical `provider/model` shapes (OpenRouter slugs).
  if (m.startsWith('openai/')) return 'openai';
  if (m.startsWith('anthropic/')) return 'anthropic';
  if (m.startsWith('google/') || m.startsWith('gemini/')) return 'google';
  if (m.startsWith('perplexity/')) return 'perplexity';
  if (m.startsWith('openrouter/')) return 'openrouter';
  if (m.startsWith('groq/')) return 'groq';

  // Bare model names — route by family.
  if (m.startsWith('gpt-') || m.includes('/gpt-')) return 'openai';
  if (m.startsWith('claude-') || m.includes('/claude-')) return 'anthropic';
  if (m.startsWith('gemini-') || m.includes('/gemini-')) return 'google';
  if (m.startsWith('whisper')) return 'groq';
  if (m.includes('grok')) return 'grok';
  if (m.startsWith('deepseek')) return 'deepseek';
  if (m.startsWith('qwen')) return 'qwen';
  if (m.startsWith('nvidia')) return 'nvidia';
  if (m.startsWith('mistral')) return 'mistral';

  // Fallback — if there's a slug prefix, use it; otherwise keep the whole
  // name so the AI tab at least shows which model is unclassified.
  const prefix = m.split('/')[0];
  return prefix && prefix !== m ? prefix : 'unknown';
}

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google (Gemini)',
  perplexity: 'Perplexity',
  openrouter: 'OpenRouter',
  groq: 'Groq',
  grok: 'Grok (xAI)',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
  nvidia: 'NVIDIA',
  mistral: 'Mistral',
  unknown: 'Unclassified',
};

const getProviderRollup = unstable_cache(
  async () => {
    const admin = createAdminClient();
    const now = Date.now();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();

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
    const latencyBuckets = new Map<string, number[]>();

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

    for (const row of topic.data ?? []) {
      const stages =
        (row.pipeline_state as {
          stages?: Array<{ model?: string; duration_ms?: number; error?: unknown }>;
        } | null)?.stages ?? [];
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

    return [...byProvider.values()].sort(
      (a, b) => b.cost7d - a.cost7d || b.calls7d - a.calls7d,
    );
  },
  ['infrastructure-ai-tab'],
  { revalidate: INFRA_CACHE_TTL, tags: [INFRA_CACHE_TAG] },
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

export async function AiTab() {
  const providers = await getProviderRollup();

  const totalCalls = providers.reduce((acc, p) => acc + p.calls7d, 0);
  const totalTokens = providers.reduce((acc, p) => acc + p.tokens7d, 0);
  const totalCost7d = providers.reduce((acc, p) => acc + p.cost7d, 0);
  const totalCost24h = providers.reduce((acc, p) => acc + p.cost24h, 0);
  const totalFailures = providers.reduce((acc, p) => acc + p.failures7d, 0);
  const failRatePct = totalCalls > 0 ? Math.round((totalFailures / totalCalls) * 100) : 0;

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
          label="Fail rate (7d)"
          value={`${failRatePct}%`}
          sub={`${totalFailures} errors`}
        />
      </section>

      <SectionCard
        icon={<Layers size={18} />}
        title="Providers"
        sub="Per-provider spend, throughput, and latency (last 7 days)"
        eyebrow="Roll-up"
        tone="brand"
      >
        {providers.length === 0 ? (
          <p className="text-sm text-text-muted">
            No provider telemetry in the last 7 days. Run a topic search to populate.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {providers.map((p) => (
              <div
                key={p.slug}
                className="rounded-lg border border-nativz-border/60 bg-background/40 p-4 transition-colors hover:border-accent/30"
              >
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-text-primary">{p.label}</h4>
                  <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 font-mono text-[12px] uppercase tracking-wide text-accent-text">
                    {p.slug}
                  </span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="text-text-muted">Spend 24h</dt>
                    <dd className="mt-0.5 tabular-nums text-text-primary">
                      {formatUsd(p.cost24h)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-text-muted">Spend 7d</dt>
                    <dd className="mt-0.5 tabular-nums font-semibold text-text-primary">
                      {formatUsd(p.cost7d)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-text-muted">Calls</dt>
                    <dd className="mt-0.5 tabular-nums text-text-primary">
                      {p.calls7d.toLocaleString()}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-text-muted">Tokens</dt>
                    <dd className="mt-0.5 tabular-nums text-text-primary">
                      {p.tokens7d.toLocaleString()}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-text-muted">Failures</dt>
                    <dd
                      className={`mt-0.5 tabular-nums ${
                        p.failures7d > 0 ? 'text-coral-300' : 'text-text-primary'
                      }`}
                    >
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
          </div>
        )}
      </SectionCard>

      <Disclosure summary="Usage dashboard · by model, by user, daily spend" defaultOpen>
        <div className="flex items-center gap-2 text-[12px] text-text-muted">
          <TrendingUp size={13} />
          Fine-grained view reads from <code className="rounded bg-background/60 px-1">api_usage_logs</code>.
          Switch between 7 / 30 / 90 day windows below.
        </div>
        <div className="mt-4">
          <UsageDashboard />
        </div>
      </Disclosure>

      <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-[12px] text-amber-200/90">
        <strong className="font-semibold text-amber-200">Cost accuracy caveat:</strong>{' '}
        OpenRouter costs here are local estimates (tokens × our cached price table), not
        post-billing truth. For exact numbers wire OpenRouter&apos;s
        {' '}
        <a
          href="https://openrouter.ai/docs/features/generation"
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-dotted"
        >
          generation webhook
        </a>{' '}
        into a Cortex endpoint and reconcile{' '}
        <code className="rounded bg-background/60 px-1">api_usage_logs.cost_usd</code> per-call.
      </div>

      <p className="text-[12px] text-text-muted">
        Provider roll-up fuses two sources: per-stage{' '}
        <code className="rounded bg-background/60 px-1">pipeline_state.stages</code> (calls,
        latency, failures) and{' '}
        <code className="rounded bg-background/60 px-1">api_usage_logs</code> (tokens + estimated cost).
      </p>
    </div>
  );
}
