'use client';

/**
 * UsageDashboard — OpenRouter-style token / cost analytics for Cortex.
 *
 * Layout:
 *   1. Summary strip: Total cost (prominent) · Used today · Used this month ·
 *      Reconciled (truth-coverage from the OpenRouter webhook).
 *   2. Cost ↔ tokens toggle + stacked daily bar chart, one stack per model.
 *   3. Top models this window (ordered by cost, tokens secondary).
 *   4. Feature × dominant-model breakdown.
 *
 * Every chart / table is wrapped in <ChartCard>, which gives it a download
 * button (per-view CSV), an expand-to-fullscreen button, and a legend +
 * data-points footer matching the reference design.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BarChart3,
  CalendarDays,
  DollarSign,
  ListOrdered,
  ShieldCheck,
  Table2,
  Wallet,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartCard, type LegendItem } from '@/components/admin/infrastructure/chart-card';

interface UsageSummary {
  byModel: Record<string, { service: string; totalTokens: number; costUsd: number; requests: number }>;
  byFeature: Record<string, { model: string; totalTokens: number; costUsd: number; requests: number }>;
  total: { totalTokens: number; costUsd: number; requests: number };
  daily: { date: string; totalTokens: number; costUsd: number; requests: number }[];
  dailyByModel: {
    date: string;
    tokensByModel: Record<string, number>;
    costByModel: Record<string, number>;
  }[];
  today: { totalTokens: number; costUsd: number; requests: number };
  thisMonth: { totalTokens: number; costUsd: number; requests: number };
  reconciliation: {
    reconciled: number;
    estimated: number;
    total: number;
    coveragePct: number;
    reconciledCostUsd: number;
  };
}

const PRESETS = [
  { label: '24h', days: 1 },
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
] as const;

// Deterministic palette — first model seen gets slot 0, etc.
const CHART_COLORS = [
  '#00AEEF', // nz-cyan
  '#9314CE', // nz-purple
  '#34D399', // emerald
  '#F59E0B', // amber
  '#ED6B63', // nz-coral
  '#38BDF8', // sky
  '#A78BFA', // violet
  '#FB923C', // orange
  '#22D3EE', // cyan-300
  '#F472B6', // pink
];

function colorForIndex(i: number): string {
  return CHART_COLORS[i % CHART_COLORS.length];
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(0)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatUsd(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '$0.00';
  if (n < 0.01) return '<$0.01';
  if (n < 10) return `$${n.toFixed(2)}`;
  if (n < 1000) return `$${n.toFixed(2)}`;
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatUsdAxis(n: number): string {
  if (n === 0) return '$0';
  if (n < 0.01) return '<$0.01';
  if (n < 1) return `$${n.toFixed(2)}`;
  if (n < 1000) return `$${n.toFixed(0)}`;
  return `$${(n / 1000).toFixed(1)}k`;
}

function providerFromModel(model: string): string {
  const m = model.toLowerCase();
  if (m.startsWith('openai/') || m.startsWith('gpt-')) return 'openai';
  if (m.startsWith('anthropic/') || m.startsWith('claude-')) return 'anthropic';
  if (m.startsWith('google/') || m.startsWith('gemini/') || m.startsWith('gemini-')) return 'google';
  if (m.startsWith('perplexity/')) return 'perplexity';
  if (m.startsWith('openrouter/')) return 'openrouter';
  if (m.startsWith('groq/') || m.startsWith('whisper')) return 'groq';
  if (m.includes('grok')) return 'grok';
  if (m.startsWith('deepseek')) return 'deepseek';
  if (m.startsWith('qwen') || m.startsWith('dashscope/')) return 'qwen';
  if (m.startsWith('nvidia')) return 'nvidia';
  if (m.startsWith('mistral')) return 'mistral';
  return m.split('/')[0] || 'unknown';
}

function getDateRange(days: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

type ChartMetric = 'cost' | 'tokens';

export function UsageDashboard() {
  const [activeDays, setActiveDays] = useState(30);
  const [metric, setMetric] = useState<ChartMetric>('cost');
  const [data, setData] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsage = useCallback(async (days: number) => {
    setLoading(true);
    setError(null);
    try {
      const { from, to } = getDateRange(days);
      const res = await fetch(
        `/api/usage?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      );
      if (!res.ok) throw new Error('Failed to fetch usage data');
      const json = (await res.json()) as UsageSummary;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUsage(activeDays);
  }, [activeDays, fetchUsage]);

  // Stable model order — top 8 by cost across the window. Everything else
  // lumps into "Other". We colour them in that order and reuse the index for
  // both the chart stack and the "top models" list swatches.
  const topModelKeys = useMemo(() => {
    if (!data) return [] as string[];
    return Object.entries(data.byModel)
      .sort(([, a], [, b]) => b.costUsd - a.costUsd || b.totalTokens - a.totalTokens)
      .slice(0, 8)
      .map(([k]) => k);
  }, [data]);

  const chartRows = useMemo(() => {
    if (!data) return [] as Array<Record<string, number | string>>;
    return data.dailyByModel.map((day) => {
      const row: Record<string, number | string> = { date: day.date };
      const source = metric === 'cost' ? day.costByModel : day.tokensByModel;
      let other = 0;
      for (const [model, v] of Object.entries(source)) {
        if (topModelKeys.includes(model)) {
          row[model] = ((row[model] as number | undefined) ?? 0) + v;
        } else {
          other += v;
        }
      }
      if (other > 0) row['Other'] = other;
      return row;
    });
  }, [data, topModelKeys, metric]);

  const hasOtherBucket = useMemo(() => chartRows.some((r) => 'Other' in r), [chartRows]);

  const chartLegend: LegendItem[] = useMemo(() => {
    if (!data) return [];
    return topModelKeys.slice(0, 5).map((model, i) => {
      const stats = data.byModel[model];
      const value = stats
        ? metric === 'cost'
          ? formatUsd(stats.costUsd)
          : formatTokens(stats.totalTokens)
        : '—';
      return {
        color: colorForIndex(i),
        label: model,
        value,
      };
    });
  }, [data, metric, topModelKeys]);

  const exportCsv = useCallback(() => {
    const { from, to } = getDateRange(activeDays);
    const url = `/api/usage/export.csv?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    window.open(url, '_blank');
  }, [activeDays]);

  const exportChartCsv = useCallback(() => {
    if (!data) return;
    const header = ['date', ...topModelKeys, hasOtherBucket ? 'Other' : null].filter(Boolean) as string[];
    const rows = chartRows.map((r) => header.map((c) => r[c] ?? 0));
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cortex-daily-${metric}-${activeDays}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data, topModelKeys, hasOtherBucket, chartRows, metric, activeDays]);

  const exportModelsCsv = useCallback(() => {
    if (!data) return;
    const header = ['rank', 'model', 'provider', 'calls', 'tokens', 'cost_usd'];
    const rows = Object.entries(data.byModel)
      .sort(([, a], [, b]) => b.costUsd - a.costUsd || b.totalTokens - a.totalTokens)
      .map(([model, stats], i) => [
        i + 1,
        model,
        providerFromModel(model),
        stats.requests,
        stats.totalTokens,
        stats.costUsd.toFixed(6),
      ]);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cortex-top-models-${activeDays}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data, activeDays]);

  return (
    <div className="space-y-6">
      {/* Summary tiles — cost first, tokens as subheading; reconciliation is the */}
      {/* honest "how much of this is ground-truth" signal.                       */}
      <div className="grid gap-3 md:grid-cols-4">
        <PrimaryTile
          label="Total cost"
          value={data ? formatUsd(data.total.costUsd) : '—'}
          subValue={data ? `${formatTokens(data.total.totalTokens)} tokens` : undefined}
          sub={data ? `${data.total.requests.toLocaleString()} calls · last ${activeDays}d` : undefined}
        />
        <SecondaryTile
          icon={<CalendarDays size={13} />}
          label="Used today"
          value={data ? formatUsd(data.today.costUsd) : '—'}
          sub={data ? `${formatTokens(data.today.totalTokens)} tokens · ${data.today.requests} calls` : undefined}
        />
        <SecondaryTile
          icon={<Wallet size={13} />}
          label="Used this month"
          value={data ? formatUsd(data.thisMonth.costUsd) : '—'}
          sub={data ? `${formatTokens(data.thisMonth.totalTokens)} tokens · ${data.thisMonth.requests} calls` : undefined}
        />
        <ReconciledTile reconciliation={data?.reconciliation} />
      </div>

      {/* Date presets + download-logs action sit in a compact toolbar so they */}
      {/* don't steal visual weight from the summary above.                    */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-nativz-border bg-surface/60 p-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="pl-2 pr-1 text-[11px] font-mono uppercase tracking-[0.18em] text-text-muted">
            Range
          </span>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setActiveDays(p.days)}
              className={
                'rounded-lg border px-2.5 py-1 text-[12px] font-medium transition-colors ' +
                (activeDays === p.days
                  ? 'border-accent/50 bg-accent/15 text-accent-text'
                  : 'border-nativz-border bg-background/40 text-text-secondary hover:border-accent/30 hover:text-text-primary')
              }
            >
              {p.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={!data}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-nz-purple/40 bg-nz-purple/10 px-3 py-1.5 text-[13px] font-medium text-nz-purple-100 transition-colors hover:border-nz-purple/60 hover:bg-nz-purple/20 disabled:opacity-50"
        >
          Download full logs
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-[13px] text-red-300">
          {error}
        </div>
      )}

      {loading && !data && (
        <>
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </>
      )}

      {data && (
        <>
          <ChartCard
            icon={<BarChart3 size={18} />}
            title={metric === 'cost' ? 'Cost over time' : 'Tokens over time'}
            subtitle={`Daily spend stacked by model · last ${activeDays} days`}
            tone="action"
            onDownload={exportChartCsv}
            downloadLabel="Download chart CSV"
            legend={chartLegend}
            dataPointsLabel={`${chartRows.length} data point${chartRows.length === 1 ? '' : 's'}`}
          >
            <MetricToggle metric={metric} onChange={setMetric} />
            <div className="mt-3">
              {chartRows.length === 0 ? (
                <div className="flex h-56 items-center justify-center text-[13px] text-text-muted">
                  No usage recorded in this window.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={chartRows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: string) => {
                        const d = new Date(v);
                        return `${d.getMonth() + 1}/${d.getDate()}`;
                      }}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) =>
                        metric === 'cost' ? formatUsdAxis(v) : formatTokens(v)
                      }
                      width={56}
                    />
                    <Tooltip
                      content={(props) => <StackedTooltip {...props} metric={metric} />}
                      cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                    />
                    {topModelKeys.map((model, i) => (
                      <Bar
                        key={model}
                        dataKey={model}
                        stackId="stack"
                        fill={colorForIndex(i)}
                        radius={i === topModelKeys.length - 1 && !hasOtherBucket ? [4, 4, 0, 0] : undefined}
                        maxBarSize={42}
                      />
                    ))}
                    {hasOtherBucket && (
                      <Bar
                        dataKey="Other"
                        stackId="stack"
                        fill="#6b7280"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={42}
                      />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </ChartCard>

          <ChartCard
            icon={<ListOrdered size={18} />}
            title="Top models · this window"
            subtitle={`Ranked by cost across the last ${activeDays} days`}
            tone="brand"
            onDownload={exportModelsCsv}
            downloadLabel="Download top-models CSV"
            hideExpand
            dataPointsLabel={`${Object.keys(data.byModel).length} model${
              Object.keys(data.byModel).length === 1 ? '' : 's'
            }`}
            padContent={false}
          >
            {Object.keys(data.byModel).length === 0 ? (
              <p className="mt-4 text-[13px] text-text-muted">No model activity in this window.</p>
            ) : (
              <ol className="mt-3 divide-y divide-nativz-border/40">
                {Object.entries(data.byModel)
                  .sort(([, a], [, b]) => b.costUsd - a.costUsd || b.totalTokens - a.totalTokens)
                  .map(([model, stats], i) => (
                    <li
                      key={model}
                      className="flex items-center gap-3 py-2.5 text-[14px]"
                    >
                      <span className="w-5 text-right font-mono text-[12px] text-text-muted">{i + 1}</span>
                      <span
                        aria-hidden
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: colorForIndex(topModelKeys.indexOf(model)) }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-text-primary">{model}</div>
                        <div className="truncate text-[11px] text-text-muted">
                          {providerFromModel(model)} · {stats.requests.toLocaleString()} call
                          {stats.requests === 1 ? '' : 's'} · {formatTokens(stats.totalTokens)} tokens
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-semibold tabular-nums text-text-primary">
                          {formatUsd(stats.costUsd)}
                        </div>
                        <div className="text-[11px] text-text-muted">cost</div>
                      </div>
                    </li>
                  ))}
              </ol>
            )}
          </ChartCard>

          <ChartCard
            icon={<Table2 size={18} />}
            title="Where each model is used"
            subtitle="Feature × dominant model — which model is powering which flow"
            tone="brand"
            hideExpand
            dataPointsLabel={`${Object.keys(data.byFeature).length} feature${
              Object.keys(data.byFeature).length === 1 ? '' : 's'
            }`}
            padContent={false}
          >
            {Object.keys(data.byFeature).length === 0 ? (
              <p className="mt-4 text-[13px] text-text-muted">No feature telemetry in this window.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-nativz-border/60 text-[11px] uppercase tracking-wide text-text-muted">
                      <th className="px-1 py-2 text-left font-medium">Feature</th>
                      <th className="px-1 py-2 text-left font-medium">Dominant model</th>
                      <th className="px-1 py-2 text-right font-medium">Calls</th>
                      <th className="px-1 py-2 text-right font-medium">Tokens</th>
                      <th className="px-1 py-2 text-right font-medium">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-nativz-border/40">
                    {Object.entries(data.byFeature)
                      .sort(([, a], [, b]) => b.costUsd - a.costUsd || b.totalTokens - a.totalTokens)
                      .map(([feature, stats]) => (
                        <tr key={feature} className="hover:bg-surface-hover/30">
                          <td className="px-1 py-2.5 text-text-primary">{feature.replace(/_/g, ' ')}</td>
                          <td className="px-1 py-2.5 font-mono text-[12px] text-text-secondary">
                            {stats.model}
                          </td>
                          <td className="px-1 py-2.5 text-right tabular-nums text-text-secondary">
                            {stats.requests.toLocaleString()}
                          </td>
                          <td className="px-1 py-2.5 text-right tabular-nums text-text-secondary">
                            {formatTokens(stats.totalTokens)}
                          </td>
                          <td className="px-1 py-2.5 text-right tabular-nums font-semibold text-text-primary">
                            {stats.costUsd === 0 ? (
                              <span className="text-emerald-400">free</span>
                            ) : (
                              formatUsd(stats.costUsd)
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </ChartCard>
        </>
      )}
    </div>
  );
}

function PrimaryTile({
  label,
  value,
  subValue,
  sub,
}: {
  label: string;
  value: string;
  subValue?: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-5">
      <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted/85">
        <DollarSign size={12} className="text-emerald-300" />
        {label}
      </div>
      <div className="mt-2 text-[32px] font-semibold leading-none tabular-nums text-text-primary">
        {value}
      </div>
      {subValue ? (
        <div className="mt-2 text-[13px] font-medium text-text-secondary">{subValue}</div>
      ) : null}
      {sub ? <div className="mt-0.5 text-[12px] text-text-muted">{sub}</div> : null}
    </div>
  );
}

function SecondaryTile({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-5">
      <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted/85">
        <span className="text-accent-text">{icon}</span>
        {label}
      </div>
      <div className="mt-2 text-[26px] font-semibold leading-none tabular-nums text-text-primary">
        {value}
      </div>
      {sub ? <div className="mt-2 text-[12px] text-text-muted">{sub}</div> : null}
    </div>
  );
}

function ReconciledTile({
  reconciliation,
}: {
  reconciliation?: UsageSummary['reconciliation'];
}) {
  const r = reconciliation;
  const pct = r?.coveragePct ?? 0;
  const fullyCovered = r && r.total > 0 && r.estimated === 0;
  const noneCovered = r && r.total > 0 && r.reconciled === 0;
  const empty = !r || r.total === 0;

  const tone = empty
    ? 'text-text-muted'
    : fullyCovered
      ? 'text-emerald-300'
      : noneCovered
        ? 'text-amber-300'
        : 'text-accent-text';

  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-5">
      <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted/85">
        <ShieldCheck size={12} className={tone} />
        Reconciled
      </div>
      <div className="mt-2 text-[26px] font-semibold leading-none tabular-nums text-text-primary">
        {empty ? '—' : `${pct}%`}
      </div>
      {r && r.total > 0 ? (
        <>
          <div className="mt-2 text-[12px] text-text-secondary">
            {r.reconciled.toLocaleString()} of {r.total.toLocaleString()} calls verified
          </div>
          <div className="mt-1 text-[11px] text-text-muted">
            {fullyCovered
              ? 'Every cost is OpenRouter truth.'
              : r.reconciled > 0
                ? `${formatUsd(r.reconciledCostUsd)} ground-truth · rest is local estimate.`
                : 'Still local estimates. Webhook will reconcile as calls flow.'}
          </div>
        </>
      ) : (
        <div className="mt-2 text-[12px] text-text-muted">
          Webhook ready — coverage fills in as calls land.
        </div>
      )}
    </div>
  );
}

function MetricToggle({
  metric,
  onChange,
}: {
  metric: ChartMetric;
  onChange: (m: ChartMetric) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-nativz-border bg-background/60 p-0.5">
      {(['cost', 'tokens'] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={
            'rounded-full px-3 py-1 text-[12px] font-medium transition-colors ' +
            (metric === m
              ? 'bg-accent/15 text-accent-text'
              : 'text-text-secondary hover:text-text-primary')
          }
        >
          {m === 'cost' ? 'Cost' : 'Tokens'}
        </button>
      ))}
    </div>
  );
}

interface StackedTooltipPayload {
  value?: number;
  name?: string;
  color?: string;
}

function StackedTooltip({
  active,
  payload,
  label,
  metric,
}: {
  active?: boolean;
  payload?: readonly StackedTooltipPayload[];
  label?: string | number;
  metric: ChartMetric;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload
    .map((p) => ({ value: Number(p.value ?? 0), name: String(p.name ?? ''), color: p.color ?? '#888' }))
    .filter((r) => r.name);
  const total = rows.reduce((sum, p) => sum + p.value, 0);
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  const fmt = metric === 'cost' ? formatUsd : formatTokens;
  return (
    <div className="rounded-lg border border-nativz-border bg-surface p-3 shadow-elevated">
      <p className="mb-2 text-[12px] text-text-muted">{label}</p>
      <div className="space-y-1">
        {sorted.map((p) => (
          <div key={p.name} className="flex items-center gap-2 text-[12px]">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: p.color }}
            />
            <span className="flex-1 truncate text-text-secondary" style={{ maxWidth: '20ch' }}>
              {p.name}
            </span>
            <span className="font-mono tabular-nums text-text-primary">
              {fmt(p.value)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-nativz-border/60 pt-1.5 text-[12px]">
        <span className="text-text-muted">Total</span>
        <span className="font-semibold tabular-nums text-text-primary">{fmt(total)}</span>
      </div>
    </div>
  );
}
