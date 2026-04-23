/**
 * AI settings overview — at-a-glance tiles that mirror the Infrastructure
 * page pattern. Each tile links to its own tab on click.
 *
 * Everything here runs on the server so we can hit the DB directly without
 * re-exposing an API surface. Queries are kept tight (one-row selects, count
 * aggregates) so the Overview stays fast.
 */

import { BookOpen, Cpu, DollarSign, Gauge, Key, TrendingUp } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { getScraperSettings, estimateSearchCost } from '@/lib/search/scraper-settings';
import { SectionTile } from '@/components/admin/section-tabs';

function formatUsd(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n < 0.01 && n > 0) return '<$0.01';
  return `$${n.toFixed(2)}`;
}

interface OverviewStats {
  modelSlug: string | null;
  hasKey: boolean;
  skillsCount: number;
  costPerSearchUsd: number;
  apifySpend7dUsd: number;
  apifyRuns7d: number;
  modelSpend7dUsd: number;
}

/**
 * Helper: tolerate-missing-column/table reads. Returns null on any error so
 * a single bad query can't crash the Overview.
 */
async function safeSum(
  rows: Array<{ cost_usd?: number | null }> | null | undefined,
): Promise<number> {
  if (!rows) return 0;
  return rows.reduce((sum, r) => sum + Number(r.cost_usd ?? 0), 0);
}

/** Run a Supabase query builder (thenable) and return null instead of throwing. */
async function tolerant<T>(fn: () => PromiseLike<T>): Promise<T | null> {
  try {
    return await Promise.resolve(fn());
  } catch (err) {
    console.error('[ai-settings overview] query failed (non-fatal):', err);
    return null;
  }
}

async function loadStats(): Promise<OverviewStats> {
  const empty: OverviewStats = {
    modelSlug: null,
    hasKey: false,
    skillsCount: 0,
    costPerSearchUsd: 0,
    apifySpend7dUsd: 0,
    apifyRuns7d: 0,
    modelSpend7dUsd: 0,
  };

  try {
    const admin = createAdminClient();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [agencyRes, skillsCountRes, apifyRes, apiUsageRes, scraperSettings] = await Promise.all([
      tolerant(() => admin.from('agency_settings').select('*').limit(1).maybeSingle()),
      tolerant(() => admin.from('nerd_skills').select('id', { count: 'exact', head: true }).eq('is_active', true)),
      tolerant(() => admin.from('apify_runs').select('cost_usd').gte('started_at', sevenDaysAgo)),
      tolerant(() => admin.from('api_usage_logs').select('cost_usd').gte('created_at', sevenDaysAgo)),
      tolerant(() => getScraperSettings()),
    ]);

    const agency = ((agencyRes?.data ?? {}) as Record<string, unknown>);
    const modelCandidates = [
      agency.model,
      agency.platform_model,
      agency.nerd_model,
      agency.topic_search_research_model,
      agency.topic_search_merger_model,
    ].map((v) => (typeof v === 'string' ? v.trim() : ''));
    const modelSlug = modelCandidates.find((v) => v) ?? null;

    const hasKey = Boolean(
      (typeof agency.openrouter_api_key === 'string' && agency.openrouter_api_key.length) ||
        (typeof agency.llm_api_key === 'string' && agency.llm_api_key.length) ||
        (typeof agency.openrouter_key === 'string' && agency.openrouter_key.length) ||
        (agency.llm_provider_keys && typeof agency.llm_provider_keys === 'object'),
    );

    const apifySpend7dUsd = await safeSum(apifyRes?.data ?? null);
    const modelSpend7dUsd = await safeSum(apiUsageRes?.data ?? null);
    const apifyRuns7d = apifyRes?.data?.length ?? 0;

    const costPerSearchUsd = scraperSettings ? estimateSearchCost(scraperSettings).totalUsd : 0;

    return {
      modelSlug,
      hasKey,
      skillsCount: skillsCountRes?.count ?? 0,
      costPerSearchUsd,
      apifySpend7dUsd,
      apifyRuns7d,
      modelSpend7dUsd,
    };
  } catch (err) {
    console.error('[ai-settings overview] loadStats crashed (returning empty):', err);
    return empty;
  }
}

export async function AiSettingsOverviewTab() {
  const stats = await loadStats();
  const base = '/admin/settings/ai';

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">
        At-a-glance health for every AI subsystem Cortex runs. Click a tile to drill in.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SectionTile
          href={`${base}?tab=model`}
          icon={<Cpu size={18} />}
          title="Model"
          status={stats.modelSlug ? 'ok' : 'warn'}
          primary={stats.modelSlug ?? 'Not configured'}
          secondary="Routed via OpenRouter"
        />
        <SectionTile
          href={`${base}?tab=credentials`}
          icon={<Key size={18} />}
          title="API key"
          status={stats.hasKey ? 'ok' : 'warn'}
          primary={stats.hasKey ? 'OpenRouter key set' : 'No key on file'}
          secondary="Single key powers every feature"
        />
        <SectionTile
          href={`${base}?tab=skills`}
          icon={<BookOpen size={18} />}
          title="Skills"
          status={stats.skillsCount > 0 ? 'ok' : 'soon'}
          primary={`${stats.skillsCount} active skill${stats.skillsCount === 1 ? '' : 's'}`}
          secondary="Context loaded into the Nerd"
        />
        <SectionTile
          href={`${base}?tab=search-cost`}
          icon={<Gauge size={18} />}
          title="Search cost"
          primary={`≈ ${formatUsd(stats.costPerSearchUsd)} / search`}
          secondary="Per-platform volumes + estimator"
        />
        <SectionTile
          href={`${base}?tab=usage`}
          icon={<TrendingUp size={18} />}
          title="Model usage (7d)"
          primary={formatUsd(stats.modelSpend7dUsd)}
          secondary="OpenRouter spend across all features"
        />
        <SectionTile
          href={`${base}?tab=search-cost`}
          icon={<DollarSign size={18} />}
          title="Apify spend (7d)"
          primary={formatUsd(stats.apifySpend7dUsd)}
          secondary={`${stats.apifyRuns7d} scraper run${stats.apifyRuns7d === 1 ? '' : 's'}`}
        />
      </div>
    </div>
  );
}
