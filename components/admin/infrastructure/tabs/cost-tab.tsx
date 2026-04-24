/**
 * Infrastructure › Cost — unified AI + Apify spend, driven by a single
 * analytics-style DateRangePicker at the top.
 *
 * Structure, top → bottom:
 *   1. Range toolbar — presets + custom calendar, synced to URL
 *      (?preset=last_7d, ?preset=custom&from=X&to=Y).
 *   2. Spend strip (3 stats) — total, AI, Apify, all in the selected range.
 *   3. AI providers section — existing <UsageDashboard/>, has its own date
 *      controls internally (kept separate so the dashboard stays portable).
 *   4. Apify scrapers section — range-aware <ApifyTab/> reads the same
 *      range as the spend strip so everything stays in sync.
 */

import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { Stat } from '../stat';
import { INFRA_CACHE_TAG } from '../cache';
import { UsageDashboard } from '@/components/settings/usage-dashboard';
import { ApifyTab } from './apify-tab';
import { RangeToolbar } from '../range-toolbar';
import { rangeFromSearchParams } from '../range-utils';
import type { DateRange, DateRangePreset } from '@/lib/types/reporting';
import { presetLabel } from '@/lib/reporting/date-presets';

const getCostSummary = unstable_cache(
  async (range: DateRange) => {
    const admin = createAdminClient();
    const startIso = new Date(`${range.start}T00:00:00`).toISOString();
    const endIso = new Date(`${range.end}T23:59:59.999`).toISOString();

    const [apifyRes, aiRes] = await Promise.all([
      admin.from('apify_runs').select('cost_usd').gte('started_at', startIso).lte('started_at', endIso),
      admin.from('api_usage_logs').select('cost_usd').gte('created_at', startIso).lte('created_at', endIso),
    ]);

    const sum = (rows: { cost_usd: number | string | null }[] | null): number =>
      (rows ?? []).reduce((acc, r) => acc + Number(r.cost_usd ?? 0), 0);

    return {
      apifySpend: sum(apifyRes.data as { cost_usd: number | string | null }[] | null),
      aiSpend: sum(aiRes.data as { cost_usd: number | string | null }[] | null),
    };
  },
  ['infrastructure-cost-summary-v2'],
  { revalidate: 60, tags: [INFRA_CACHE_TAG] },
);

function formatUsd(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '$0.00';
  if (n < 0.01) return '<$0.01';
  if (n < 10) return `$${n.toFixed(2)}`;
  if (n < 1000) return `$${n.toFixed(0)}`;
  return `$${(n / 1000).toFixed(1)}k`;
}

function daysBetween(range: DateRange): number {
  const s = new Date(`${range.start}T00:00:00`).getTime();
  const e = new Date(`${range.end}T23:59:59.999`).getTime();
  return Math.max(1, Math.round((e - s) / (24 * 60 * 60 * 1000)));
}

interface Props {
  preset?: string;
  from?: string;
  to?: string;
}

export async function CostTab({ preset, from, to }: Props) {
  const { preset: resolvedPreset, range } = rangeFromSearchParams({ preset, from, to });
  const s = await getCostSummary(range);
  const total = s.apifySpend + s.aiSpend;
  const days = daysBetween(range);
  const avgPerDay = total / days;
  const label = presetLabel(resolvedPreset).toLowerCase();

  return (
    <div className="space-y-10">
      {/* Range picker drives everything below. URL-synced. */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Spend</h2>
          <p className="text-[12px] text-text-muted">
            Pick a range — total cost, AI spend, and Apify runs all follow.
          </p>
        </div>
        <RangeToolbar />
      </div>

      {/* Spend strip — all stats driven by the selected range. */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Total spend"
          value={formatUsd(total)}
          sub={`${label} · ${days} day${days === 1 ? '' : 's'}`}
        />
        <Stat
          label="AI"
          value={formatUsd(s.aiSpend)}
          sub={total > 0 ? `${Math.round((s.aiSpend / total) * 100)}% of total` : 'OpenRouter + direct'}
        />
        <Stat
          label="Apify"
          value={formatUsd(s.apifySpend)}
          sub={total > 0 ? `${Math.round((s.apifySpend / total) * 100)}% of total` : 'Scrapers'}
        />
        <Stat
          label="Avg / day"
          value={formatUsd(avgPerDay)}
          sub={
            days >= 7
              ? `Projected month: ${formatUsd(avgPerDay * 30)}`
              : `Based on ${days} day${days === 1 ? '' : 's'} — too short to project`
          }
        />
      </section>

      {/* AI — the larger share in most ranges. */}
      <section className="space-y-3">
        <header className="flex items-baseline justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">AI providers</h2>
            <p className="text-[12px] text-text-muted">
              OpenRouter + direct providers · tokens, spend, top models.
            </p>
          </div>
          <span className="font-mono text-[12px] tabular-nums text-text-muted">
            {formatUsd(s.aiSpend)} · {label}
          </span>
        </header>
        {/* Controlled by the toolbar at the top of this tab — hides the
           dashboard's own picker so the page has a single canonical range. */}
        <UsageDashboard
          controlledPreset={resolvedPreset as DateRangePreset}
          controlledCustomRange={range}
          hidePicker
        />
      </section>

      {/* Apify — range-driven, matches the toolbar above. */}
      <section className="space-y-3">
        <header className="flex items-baseline justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Apify scrapers</h2>
            <p className="text-[12px] text-text-muted">
              Actor runs, failure rate, account plan, proxy + storage.
            </p>
          </div>
          <span className="font-mono text-[12px] tabular-nums text-text-muted">
            {formatUsd(s.apifySpend)} · {label}
          </span>
        </header>
        <ApifyTab range={range} preset={resolvedPreset as DateRangePreset} />
      </section>
    </div>
  );
}
