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
import { BarChart3, ListOrdered, ShieldCheck, Table2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartCard, type LegendItem } from '@/components/admin/infrastructure/chart-card';
import { DateRangePicker } from '@/components/reporting/date-range-picker';
import { resolvePresetRange } from '@/lib/reporting/date-presets';
import type { DateRange, DateRangePreset } from '@/lib/types/reporting';

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

/**
 * Translate the analytics-picker range (local YYYY-MM-DD start + end,
 * both inclusive) into an ISO window for the `/api/usage` endpoint.
 * `start` goes to 00:00 local time, `end` to 23:59:59.999 — otherwise the
 * "today" bucket loses everything after midnight on the chosen day.
 */
function rangeToApiWindow(range: DateRange): { from: string; to: string } {
  const [sy, sm, sd] = range.start.split('-').map(Number);
  const [ey, em, ed] = range.end.split('-').map(Number);
  const from = new Date(sy, sm - 1, sd, 0, 0, 0, 0).toISOString();
  const to = new Date(ey, em - 1, ed, 23, 59, 59, 999).toISOString();
  return { from, to };
}

function daysInRange(range: DateRange): number {
  const [sy, sm, sd] = range.start.split('-').map(Number);
  const [ey, em, ed] = range.end.split('-').map(Number);
  const s = new Date(sy, sm - 1, sd).getTime();
  const e = new Date(ey, em - 1, ed).getTime();
  const diff = Math.round((e - s) / 86_400_000);
  return Math.max(1, diff + 1); // +1: both endpoints are inclusive
}

type ChartMetric = 'cost' | 'tokens';

interface UsageDashboardProps {
  /**
   * Controlled-mode preset. When provided, the dashboard reflects the
   * caller's range instead of its internal state — used by the Cost tab
   * to sync with its top-level DateRangePicker toolbar.
   */
  controlledPreset?: DateRangePreset;
  controlledCustomRange?: DateRange;
  /**
   * When the caller drives the range from outside, hide the built-in
   * picker so we don't show two duplicate controls. Settings/AI (where
   * UsageDashboard stands alone) leaves this false to keep its picker.
   */
  hidePicker?: boolean;
}

export function UsageDashboard({
  controlledPreset,
  controlledCustomRange,
  hidePicker = false,
}: UsageDashboardProps = {}) {
  const isControlled = controlledPreset !== undefined;
  const [internalPreset, setInternalPreset] = useState<DateRangePreset>('last_30d');
  const [internalCustomRange, setInternalCustomRange] = useState<DateRange | undefined>(undefined);
  const [metric, setMetric] = useState<ChartMetric>('cost');
  const [data, setData] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const preset = isControlled ? controlledPreset : internalPreset;
  const customRange = isControlled ? controlledCustomRange : internalCustomRange;
  const setPreset = (p: DateRangePreset) => {
    if (isControlled) return; // parent is source of truth
    setInternalPreset(p);
  };
  const setCustomRange = (r: DateRange) => {
    if (isControlled) return;
    setInternalCustomRange(r);
  };

  const resolvedRange = useMemo<DateRange>(
    () => (preset === 'custom' && customRange ? customRange : resolvePresetRange(preset)),
    [preset, customRange],
  );
  const rangeDays = useMemo(() => daysInRange(resolvedRange), [resolvedRange]);
  const rangeLabelShort = useMemo(() => {
    if (preset !== 'custom') {
      // Matches the picker's own preset labels for non-custom ranges.
      return `last ${rangeDays} day${rangeDays === 1 ? '' : 's'}`;
    }
    return `${resolvedRange.start} → ${resolvedRange.end}`;
  }, [preset, rangeDays, resolvedRange]);

  const fetchUsage = useCallback(async (range: DateRange) => {
    setLoading(true);
    setError(null);
    try {
      const { from, to } = rangeToApiWindow(range);
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
    void fetchUsage(resolvedRange);
    // Fetch re-runs on range change. resolvedRange identity changes when the
    // picker applies a new preset or custom span.
  }, [resolvedRange, fetchUsage]);

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

  const exportChartCsv = useCallback(() => {
    if (!data) return;
    const header = ['date', ...topModelKeys, hasOtherBucket ? 'Other' : null].filter(Boolean) as string[];
    const rows = chartRows.map((r) => header.map((c) => r[c] ?? 0));
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cortex-daily-${metric}-${resolvedRange.start}_to_${resolvedRange.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data, topModelKeys, hasOtherBucket, chartRows, metric, resolvedRange]);

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
    a.download = `cortex-top-models-${resolvedRange.start}_to_${resolvedRange.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data, resolvedRange]);

  return (
    <div className="space-y-6">
      {/* Summary tiles — cost + tokens only; reconciliation tile as the 4th.   */}
      {/* Subtext is deliberately minimal — repeated "calls / last Nd" strings  */}
      {/* added noise without teaching anything the number didn't already say. */}
      <div className="grid gap-3 md:grid-cols-4">
        <PrimaryTile
          label="Total cost"
          value={data ? formatUsd(data.total.costUsd) : '—'}
          tokens={data ? formatTokens(data.total.totalTokens) : undefined}
        />
        <SecondaryTile
          label="Used today"
          value={data ? formatUsd(data.today.costUsd) : '—'}
          tokens={data ? formatTokens(data.today.totalTokens) : undefined}
        />
        <SecondaryTile
          label="Used this month"
          value={data ? formatUsd(data.thisMonth.costUsd) : '—'}
          tokens={data ? formatTokens(data.thisMonth.totalTokens) : undefined}
        />
        <ReconciledTile reconciliation={data?.reconciliation} />
      </div>

      {/* Date range picker — same component analytics uses. Supports every */}
      {/* preset (Yesterday / Last 7/28/30/90 / This week/month/year / Last  */}
      {/* week/month) plus a full custom two-month calendar.                */}
      {/* Hidden when the parent (Cost tab) drives the range from a shared  */}
      {/* toolbar — avoids showing two duplicate pickers on the same page.  */}
      {!hidePicker && (
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker
            value={preset}
            onChange={setPreset}
            customRange={customRange}
            onCustomRangeChange={setCustomRange}
          />
        </div>
      )}

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
            subtitle={`Daily spend stacked by model · ${rangeLabelShort}`}
            tone="neutral"
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
            subtitle={`Ranked by cost across ${rangeLabelShort}`}
            tone="neutral"
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
            tone="neutral"
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

/** Headline summary tile — the big "Total cost" card. */
function PrimaryTile({ label, value, tokens }: { label: string; value: string; tokens?: string }) {
  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-5">
      <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted/85">
        {label}
      </div>
      <div className="mt-2 text-[32px] font-semibold leading-none tabular-nums text-text-primary">
        {value}
      </div>
      {tokens ? (
        <div className="mt-2 text-[13px] text-text-secondary tabular-nums">{tokens} tokens</div>
      ) : null}
    </div>
  );
}

/** Secondary summary tile — same shape, slightly smaller headline. */
function SecondaryTile({ label, value, tokens }: { label: string; value: string; tokens?: string }) {
  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-5">
      <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted/85">
        {label}
      </div>
      <div className="mt-2 text-[26px] font-semibold leading-none tabular-nums text-text-primary">
        {value}
      </div>
      {tokens ? (
        <div className="mt-2 text-[13px] text-text-secondary tabular-nums">{tokens} tokens</div>
      ) : null}
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
