'use client';

/**
 * UsageDashboard — OpenRouter-app-style token analytics.
 *
 * Layout mirrors openrouter.ai/apps for Cortex-specific context:
 *   • Summary strip: Total tokens · Used today · Used this month · Download logs.
 *   • Stacked-bar daily chart, coloured by model.
 *   • Top models list for the active window.
 *   • Feature × model breakdown (what's-being-used-where).
 *
 * Data comes from /api/usage, which now returns `dailyByModel`, `today`, and
 * `thisMonth` roll-ups in addition to the original `byFeature` / `byUser`
 * aggregates.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Wallet } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';

interface UsageSummary {
  byModel: Record<string, { service: string; totalTokens: number; costUsd: number; requests: number }>;
  byFeature: Record<string, { model: string; totalTokens: number; costUsd: number; requests: number }>;
  total: { totalTokens: number; costUsd: number; requests: number };
  daily: { date: string; totalTokens: number; costUsd: number; requests: number }[];
  dailyByModel: { date: string; tokensByModel: Record<string, number> }[];
  today: { totalTokens: number; costUsd: number; requests: number };
  thisMonth: { totalTokens: number; costUsd: number; requests: number };
}

const PRESETS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
] as const;

// Deterministic palette picker — first model seen gets slot 0, second gets
// slot 1, etc. Keeps the same model the same colour across re-renders.
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
  return `$${n.toFixed(0)}`;
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

export function UsageDashboard() {
  const [activeDays, setActiveDays] = useState(30);
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

  // Stable model order — the top 8 models by tokens across the whole window.
  // We colour them in that order and lump the long tail into "Other".
  const topModelKeys = useMemo(() => {
    if (!data) return [] as string[];
    return Object.entries(data.byModel)
      .sort(([, a], [, b]) => b.totalTokens - a.totalTokens)
      .slice(0, 8)
      .map(([k]) => k);
  }, [data]);

  const chartRows = useMemo(() => {
    if (!data) return [] as Array<Record<string, number | string>>;
    return data.dailyByModel.map((day) => {
      const row: Record<string, number | string> = { date: day.date };
      let other = 0;
      for (const [model, tokens] of Object.entries(day.tokensByModel)) {
        if (topModelKeys.includes(model)) {
          row[model] = (row[model] as number | undefined ?? 0) + tokens;
        } else {
          other += tokens;
        }
      }
      if (other > 0) row['Other'] = other;
      return row;
    });
  }, [data, topModelKeys]);

  const hasOtherBucket = useMemo(() => chartRows.some((r) => 'Other' in r), [chartRows]);

  const exportCsv = useCallback(() => {
    const { from, to } = getDateRange(activeDays);
    const url = `/api/usage/export.csv?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    window.open(url, '_blank');
  }, [activeDays]);

  return (
    <div className="space-y-6">
      {/* Summary strip */}
      <div className="grid gap-3 md:grid-cols-4">
        <StatTile
          label="Total tokens"
          value={data ? formatTokens(data.total.totalTokens) : '—'}
          sub={data ? `${data.total.requests.toLocaleString()} calls · ${formatUsd(data.total.costUsd)}` : undefined}
          prominent
        />
        <StatTile
          label="Used today"
          value={data ? formatTokens(data.today.totalTokens) : '—'}
          sub={data ? formatUsd(data.today.costUsd) : undefined}
        />
        <StatTile
          label="Used this month"
          value={data ? formatTokens(data.thisMonth.totalTokens) : '—'}
          sub={data ? formatUsd(data.thisMonth.costUsd) : undefined}
        />
        <div className="rounded-xl border border-nativz-border bg-surface p-4 flex flex-col justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
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
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-nz-purple/40 bg-nz-purple/10 px-3 py-2 text-[13px] font-medium text-nz-purple-100 transition-colors hover:border-nz-purple/60 hover:bg-nz-purple/20 disabled:opacity-50"
          >
            <Download size={14} />
            Download logs ({activeDays}d)
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-coral-500/30 bg-coral-500/5 p-4 text-[13px] text-coral-300">
          {error}
        </div>
      )}

      {loading && !data && (
        <>
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </>
      )}

      {data && (
        <>
          {/* Stacked bar chart */}
          <section className="rounded-xl border border-nativz-border bg-surface p-5">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-[15px] font-semibold text-text-primary">
                  Cortex OpenRouter usage
                </h3>
                <p className="mt-0.5 text-[12px] text-text-muted">
                  Daily tokens, stacked by model · last {activeDays} days
                </p>
              </div>
              <div className="hidden flex-wrap justify-end gap-2 md:flex">
                {topModelKeys.slice(0, 5).map((model, i) => (
                  <LegendSwatch key={model} color={colorForIndex(i)} label={model} />
                ))}
                {topModelKeys.length > 5 && (
                  <LegendSwatch color="#6b7280" label={`+${topModelKeys.length - 5} more`} />
                )}
              </div>
            </div>
            {chartRows.length === 0 ? (
              <div className="flex h-48 items-center justify-center text-[13px] text-text-muted">
                No usage recorded in this window.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
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
                    tickFormatter={(v: number) => formatTokens(v)}
                    width={52}
                  />
                  <Tooltip content={<StackedTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  {topModelKeys.map((model, i) => (
                    <Bar
                      key={model}
                      dataKey={model}
                      stackId="tokens"
                      fill={colorForIndex(i)}
                      radius={i === topModelKeys.length - 1 && !hasOtherBucket ? [4, 4, 0, 0] : undefined}
                      maxBarSize={40}
                    />
                  ))}
                  {hasOtherBucket && (
                    <Bar
                      dataKey="Other"
                      stackId="tokens"
                      fill="#6b7280"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={40}
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
            )}
          </section>

          {/* Top models */}
          <section className="rounded-xl border border-nativz-border bg-surface">
            <header className="flex items-center justify-between gap-3 border-b border-nativz-border/60 px-5 py-3.5">
              <div>
                <h3 className="text-[15px] font-semibold text-text-primary">
                  Top models used · this window
                </h3>
                <p className="mt-0.5 text-[12px] text-text-muted">
                  Ranked by token volume across the last {activeDays} days
                </p>
              </div>
              <Wallet size={14} className="text-text-muted" />
            </header>
            {Object.keys(data.byModel).length === 0 ? (
              <p className="px-5 py-6 text-[13px] text-text-muted">No model activity in this window.</p>
            ) : (
              <ol className="divide-y divide-nativz-border/40">
                {Object.entries(data.byModel)
                  .sort(([, a], [, b]) => b.totalTokens - a.totalTokens)
                  .map(([model, stats], i) => (
                    <li
                      key={model}
                      className="flex items-center gap-3 px-5 py-2.5 text-[14px] hover:bg-surface-hover/40"
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
                          {stats.requests === 1 ? '' : 's'}
                          {stats.costUsd > 0 ? ` · ${formatUsd(stats.costUsd)}` : ''}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-semibold tabular-nums text-text-primary">
                          {formatTokens(stats.totalTokens)}
                        </div>
                        <div className="text-[11px] text-text-muted">tokens</div>
                      </div>
                    </li>
                  ))}
              </ol>
            )}
          </section>

          {/* By feature */}
          <section className="rounded-xl border border-nativz-border bg-surface">
            <header className="border-b border-nativz-border/60 px-5 py-3.5">
              <h3 className="text-[15px] font-semibold text-text-primary">
                Where each model is used
              </h3>
              <p className="mt-0.5 text-[12px] text-text-muted">
                Feature × dominant model in this window — the "what's being used on what" view.
              </p>
            </header>
            {Object.keys(data.byFeature).length === 0 ? (
              <p className="px-5 py-6 text-[13px] text-text-muted">No feature telemetry in this window.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-nativz-border/60 text-[11px] uppercase tracking-wide text-text-muted">
                      <th className="px-5 py-2 text-left font-medium">Feature</th>
                      <th className="px-5 py-2 text-left font-medium">Dominant model</th>
                      <th className="px-5 py-2 text-right font-medium">Calls</th>
                      <th className="px-5 py-2 text-right font-medium">Tokens</th>
                      <th className="px-5 py-2 text-right font-medium">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-nativz-border/40">
                    {Object.entries(data.byFeature)
                      .sort(([, a], [, b]) => b.totalTokens - a.totalTokens)
                      .map(([feature, stats]) => (
                        <tr key={feature} className="hover:bg-surface-hover/40">
                          <td className="px-5 py-2.5 text-text-primary">{feature.replace(/_/g, ' ')}</td>
                          <td className="px-5 py-2.5 font-mono text-[12px] text-text-secondary">
                            {stats.model}
                          </td>
                          <td className="px-5 py-2.5 text-right tabular-nums text-text-secondary">
                            {stats.requests.toLocaleString()}
                          </td>
                          <td className="px-5 py-2.5 text-right tabular-nums text-text-secondary">
                            {formatTokens(stats.totalTokens)}
                          </td>
                          <td className="px-5 py-2.5 text-right tabular-nums text-text-primary">
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
          </section>
        </>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
  prominent,
}: {
  label: string;
  value: string;
  sub?: string;
  prominent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-4">
      <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted/85">
        {label}
      </div>
      <div
        className={
          'mt-2 font-semibold leading-none tabular-nums text-text-primary ' +
          (prominent ? 'text-3xl' : 'text-2xl')
        }
      >
        {value}
      </div>
      {sub && <div className="mt-2 text-[12px] text-text-muted">{sub}</div>}
    </div>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-text-muted">
      <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
      <span className="truncate" title={label} style={{ maxWidth: '14ch' }}>
        {label}
      </span>
    </span>
  );
}

function StackedTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((sum, p) => sum + (p.value ?? 0), 0);
  const sorted = [...payload].sort((a, b) => b.value - a.value);
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
              {formatTokens(p.value)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-nativz-border/60 pt-1.5 text-[12px]">
        <span className="text-text-muted">Total</span>
        <span className="font-semibold tabular-nums text-text-primary">{formatTokens(total)}</span>
      </div>
    </div>
  );
}
