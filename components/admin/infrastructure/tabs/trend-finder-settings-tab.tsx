/**
 * Infrastructure › Trend finder settings — per-platform scrape volumes.
 *
 * Wraps the client-side ScraperVolumesSection (singleton `scraper_settings`
 * row editor) with a server-rendered context header that pulls the last-7-day
 * Apify spend + run count so Jack can see how the knobs translate to real
 * cost. Renamed from "Search cost" — these knobs drive Trend Finder's scrape
 * behaviour; cost is downstream.
 */

import { unstable_cache } from 'next/cache';
import { DollarSign, Sparkles, Sliders } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { ScraperVolumesSection } from '@/components/settings/scraper-volumes-section';
import { Stat } from '../stat';
import { INFRA_CACHE_TAG, INFRA_CACHE_TTL } from '../cache';

interface TrendSummary {
  apifyCost7d: number;
  apifyRuns7d: number;
  searches7d: number;
  completedSearches7d: number;
  avgCostPerSearch: number | null;
}

const getTrendSummary = unstable_cache(
  async (): Promise<TrendSummary> => {
    const admin = createAdminClient();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [apifyRes, topicRes] = await Promise.all([
      admin.from('apify_runs').select('cost_usd').gte('started_at', sevenDaysAgo),
      admin
        .from('topic_searches')
        .select('status, estimated_cost')
        .gte('created_at', sevenDaysAgo),
    ]);

    const apifyCost7d = (apifyRes.data ?? []).reduce(
      (sum, r) => sum + Number(r.cost_usd ?? 0),
      0,
    );
    const searches = topicRes.data ?? [];
    const completed = searches.filter((s) => s.status === 'completed');
    const costSamples = completed
      .map((s) => Number(s.estimated_cost))
      .filter((n) => Number.isFinite(n) && n > 0);
    const avgCostPerSearch = costSamples.length
      ? costSamples.reduce((a, b) => a + b, 0) / costSamples.length
      : null;

    return {
      apifyCost7d,
      apifyRuns7d: apifyRes.data?.length ?? 0,
      searches7d: searches.length,
      completedSearches7d: completed.length,
      avgCostPerSearch,
    };
  },
  ['infrastructure-trend-finder-summary'],
  { revalidate: INFRA_CACHE_TTL, tags: [INFRA_CACHE_TAG] },
);

function formatUsd(n: number | null): string {
  if (n == null) return '—';
  if (!Number.isFinite(n) || n === 0) return '$0.00';
  if (n < 0.01) return '<$0.01';
  if (n < 10) return `$${n.toFixed(2)}`;
  if (n < 1000) return `$${n.toFixed(0)}`;
  return `$${(n / 1000).toFixed(1)}k`;
}

export async function TrendFinderSettingsTab() {
  const summary = await getTrendSummary();

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Apify spend (7d)"
          value={formatUsd(summary.apifyCost7d)}
          sub={`${summary.apifyRuns7d} scraper run${summary.apifyRuns7d === 1 ? '' : 's'}`}
        />
        <Stat
          label="Searches (7d)"
          value={String(summary.searches7d)}
          sub={`${summary.completedSearches7d} completed`}
        />
        <Stat
          label="Avg cost / search"
          value={formatUsd(summary.avgCostPerSearch)}
          sub="From estimated_cost on completed runs"
        />
        <Stat
          label="Per-unit pricing"
          value="2026-04-23"
          sub="Last re-measured from Apify billing"
        />
      </section>

      <section className="rounded-xl border border-nativz-border bg-surface/60 p-5">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent-text">
            <Sliders size={16} />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-text-primary">How these knobs work</h2>
            <p className="mt-1 max-w-prose text-xs text-text-muted">
              Every topic search pulls the platform counts below at run time from the singleton
              <code className="mx-1 rounded bg-background/60 px-1">scraper_settings</code>
              row. No deep / medium / shallow presets — these numbers are the only knobs. The
              estimate card shows cost per search using per-unit Apify pricing measured on
              2026-04-23; real billing lives in
              <code className="mx-1 rounded bg-background/60 px-1">apify_runs</code>.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-text-muted">
              <span className="inline-flex items-center gap-1 rounded-full bg-background/60 px-2 py-0.5">
                <Sparkles size={11} className="text-accent-text" />
                Drives trend finder
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-background/60 px-2 py-0.5">
                <DollarSign size={11} className="text-emerald-300" />
                Cost impact live
              </span>
            </div>
          </div>
        </div>
      </section>

      <ScraperVolumesSection />
    </div>
  );
}
