/**
 * Infrastructure › Cost — unified AI + scraper spend.
 *
 * Merges the former "AI" (UsageDashboard) and "Scrapers" (ApifyTab) views
 * so there's one place to see where money is going. A four-stat spend
 * strip sits at the top (combined totals with AI · Apify breakdown in the
 * sub-line), then the two detail surfaces render below in their natural
 * order — AI first because it's the bigger share in nearly every period.
 */

import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { Stat } from '../stat';
import { INFRA_CACHE_TAG } from '../cache';
import { UsageDashboard } from '@/components/settings/usage-dashboard';
import { ApifyTab } from './apify-tab';

const getCostSummary = unstable_cache(
  async () => {
    const admin = createAdminClient();
    const now = Date.now();
    const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [apify24, apify7d, apify30d, ai24, ai7d, ai30d] = await Promise.all([
      admin.from('apify_runs').select('cost_usd').gte('started_at', twentyFourHoursAgo),
      admin.from('apify_runs').select('cost_usd').gte('started_at', sevenDaysAgo),
      admin.from('apify_runs').select('cost_usd').gte('started_at', thirtyDaysAgo),
      admin.from('api_usage_logs').select('cost_usd').gte('created_at', twentyFourHoursAgo),
      admin.from('api_usage_logs').select('cost_usd').gte('created_at', sevenDaysAgo),
      admin.from('api_usage_logs').select('cost_usd').gte('created_at', thirtyDaysAgo),
    ]);

    const sum = (rows: { cost_usd: number | string | null }[] | null): number =>
      (rows ?? []).reduce((acc, r) => acc + Number(r.cost_usd ?? 0), 0);

    return {
      apify24h: sum(apify24.data as { cost_usd: number | string | null }[] | null),
      apify7d: sum(apify7d.data as { cost_usd: number | string | null }[] | null),
      apify30d: sum(apify30d.data as { cost_usd: number | string | null }[] | null),
      ai24h: sum(ai24.data as { cost_usd: number | string | null }[] | null),
      ai7d: sum(ai7d.data as { cost_usd: number | string | null }[] | null),
      ai30d: sum(ai30d.data as { cost_usd: number | string | null }[] | null),
    };
  },
  ['infrastructure-cost-summary'],
  { revalidate: 60, tags: [INFRA_CACHE_TAG] },
);

function formatUsd(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '$0.00';
  if (n < 0.01) return '<$0.01';
  if (n < 10) return `$${n.toFixed(2)}`;
  if (n < 1000) return `$${n.toFixed(0)}`;
  return `$${(n / 1000).toFixed(1)}k`;
}

export async function CostTab() {
  const s = await getCostSummary();
  const total24h = s.apify24h + s.ai24h;
  const total7d = s.apify7d + s.ai7d;
  const total30d = s.apify30d + s.ai30d;

  return (
    <div className="space-y-10">
      {/* Spend strip — combined totals with per-source breakdown in the sub. */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Spend / 24h"
          value={formatUsd(total24h)}
          sub={`AI ${formatUsd(s.ai24h)} · Apify ${formatUsd(s.apify24h)}`}
        />
        <Stat
          label="Spend / 7d"
          value={formatUsd(total7d)}
          sub={`AI ${formatUsd(s.ai7d)} · Apify ${formatUsd(s.apify7d)}`}
        />
        <Stat
          label="Spend / 30d"
          value={formatUsd(total30d)}
          sub={`AI ${formatUsd(s.ai30d)} · Apify ${formatUsd(s.apify30d)}`}
        />
        <Stat
          label="Projected / month"
          value={formatUsd(total30d)}
          sub="Matches trailing 30-day total"
        />
      </section>

      {/* AI — the larger share in most periods, so it leads. */}
      <section className="space-y-3">
        <header className="flex items-baseline justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">AI providers</h2>
            <p className="text-[12px] text-text-muted">
              OpenRouter + direct providers · tokens, spend, top models.
            </p>
          </div>
          <span className="font-mono text-[12px] tabular-nums text-text-muted">
            {formatUsd(s.ai30d)} / 30d
          </span>
        </header>
        <UsageDashboard />
      </section>

      {/* Apify — scraper actors + cost breakdown. */}
      <section className="space-y-3">
        <header className="flex items-baseline justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Apify scrapers</h2>
            <p className="text-[12px] text-text-muted">
              Actor runs, failure rate, account plan, proxy + storage.
            </p>
          </div>
          <span className="font-mono text-[12px] tabular-nums text-text-muted">
            {formatUsd(s.apify30d)} / 30d
          </span>
        </header>
        <ApifyTab />
      </section>
    </div>
  );
}
