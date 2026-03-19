'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  Zap,
  Mic,
  Eye,
  Search,
  DollarSign,
  Hash,
  Activity,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ServiceData {
  totalTokens: number;
  costUsd: number;
  requests: number;
}

interface ModelData {
  service: string;
  totalTokens: number;
  costUsd: number;
  requests: number;
}

interface FeatureData {
  model: string;
  totalTokens: number;
  costUsd: number;
  requests: number;
}

interface UsageSummary {
  byService: Record<string, ServiceData>;
  byModel: Record<string, ModelData>;
  byFeature: Record<string, FeatureData>;
  total: { totalTokens: number; costUsd: number; requests: number };
  daily: { date: string; costUsd: number; requests: number }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SERVICE_META: Record<
  string,
  { label: string; icon: React.ElementType; color: string }
> = {
  openrouter: { label: 'OpenRouter / Claude', icon: Zap, color: 'text-blue-400' },
  groq: { label: 'Groq / Whisper', icon: Mic, color: 'text-green-400' },
  gemini: { label: 'Google AI / Gemini', icon: Eye, color: 'text-accent2-text' },
  brave: { label: 'Brave Search', icon: Search, color: 'text-orange-400' },
};

function formatCost(usd: number): string {
  if (usd === 0) return '$0.0000';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(4)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

const MODEL_LABELS: Record<string, string> = {
  'openrouter/hunter-alpha': 'Hunter Alpha',
  'openrouter/healer-alpha': 'Healer Alpha',
  'anthropic/claude-sonnet-4-5': 'Claude Sonnet 4.5',
  'anthropic/claude-sonnet-4.5': 'Claude Sonnet 4.5',
  'gemini-2.5-flash-preview-05-20': 'Gemini 2.5 Flash',
  'gemini-embedding-001': 'Gemini Embedding',
  'whisper-large-v3': 'Whisper Large v3',
  'whisper-large-v3-turbo': 'Whisper Large v3 Turbo',
  'brave-search': 'Brave Search',
};

function modelLabel(model: string): string {
  return MODEL_LABELS[model] ?? model;
}

function serviceColor(service: string): string {
  return SERVICE_META[service]?.color ?? 'text-text-muted';
}

const PRESETS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
] as const;

function getDateRange(days: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

// ---------------------------------------------------------------------------
// Custom tooltip for chart
// ---------------------------------------------------------------------------

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-nativz-border bg-surface p-3 shadow-elevated text-sm">
      <p className="text-text-secondary mb-1">{label}</p>
      <p className="text-text-primary font-medium">
        {formatCost(payload[0].value)}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

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
        `/api/usage?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      );
      if (!res.ok) throw new Error('Failed to fetch usage data');
      const json: UsageSummary = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsage(activeDays);
  }, [activeDays, fetchUsage]);

  return (
    <div className="space-y-6">
      {/* Date range selector */}
      <div className="flex gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => setActiveDays(p.days)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeDays === p.days
                ? 'bg-accent-surface text-accent-text'
                : 'bg-surface text-text-secondary hover:text-text-primary hover:bg-surface-hover border border-nativz-border'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Error state */}
      {error && (
        <Card>
          <p className="text-red-400 text-sm">{error}</p>
        </Card>
      )}

      {/* Loading state */}
      {loading && (
        <>
          <Skeleton className="h-28 w-full rounded-xl" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </>
      )}

      {/* Loaded state */}
      {!loading && data && (
        <>
          {/* Total cost card */}
          <Card className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-surface">
              <DollarSign size={22} className="text-accent-text" />
            </div>
            <div>
              <p className="text-sm text-text-secondary">
                Total cost ({activeDays}d)
              </p>
              <p className="text-2xl font-bold text-text-primary">
                {formatCost(data.total.costUsd)}
              </p>
              <p className="text-xs text-text-muted mt-0.5">
                {formatNumber(data.total.requests)} requests &middot;{' '}
                {formatTokens(data.total.totalTokens)} tokens
              </p>
            </div>
          </Card>

          {/* Service breakdown cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.entries(SERVICE_META).map(
              ([key, { label, icon: Icon, color }]) => {
                const svc = data.byService[key] ?? {
                  totalTokens: 0,
                  costUsd: 0,
                  requests: 0,
                };
                return (
                  <Card key={key} padding="sm">
                    <div className="flex items-center gap-2 mb-3">
                      <Icon size={16} className={color} />
                      <span className="text-sm font-medium text-text-primary">
                        {label}
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-text-muted flex items-center gap-1">
                          <Activity size={12} /> Requests
                        </span>
                        <span className="text-sm text-text-secondary font-medium">
                          {formatNumber(svc.requests)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-text-muted flex items-center gap-1">
                          <Hash size={12} /> Tokens
                        </span>
                        <span className="text-sm text-text-secondary font-medium">
                          {formatTokens(svc.totalTokens)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-text-muted flex items-center gap-1">
                          <DollarSign size={12} /> Cost
                        </span>
                        <span className="text-sm text-text-primary font-semibold">
                          {formatCost(svc.costUsd)}
                        </span>
                      </div>
                    </div>
                  </Card>
                );
              }
            )}
          </div>

          {/* Model breakdown */}
          <Card>
            <h2 className="text-sm font-semibold text-text-primary mb-4">
              Usage by model
            </h2>
            {Object.keys(data.byModel).length === 0 ? (
              <p className="text-sm text-text-muted py-4 text-center">
                No model data for this period
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-nativz-border text-text-muted text-xs">
                      <th className="text-left pb-2 font-medium">Model</th>
                      <th className="text-left pb-2 font-medium">Service</th>
                      <th className="text-right pb-2 font-medium">Requests</th>
                      <th className="text-right pb-2 font-medium">Tokens</th>
                      <th className="text-right pb-2 font-medium">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(data.byModel)
                      .sort(([, a], [, b]) => b.requests - a.requests)
                      .map(([model, stats]) => (
                        <tr
                          key={model}
                          className="border-b border-nativz-border/50 last:border-0"
                        >
                          <td className="py-2.5 text-text-primary font-medium">
                            {modelLabel(model)}
                          </td>
                          <td className="py-2.5">
                            <span className={`text-xs ${serviceColor(stats.service)}`}>
                              {SERVICE_META[stats.service]?.label ?? stats.service}
                            </span>
                          </td>
                          <td className="py-2.5 text-right text-text-secondary">
                            {formatNumber(stats.requests)}
                          </td>
                          <td className="py-2.5 text-right text-text-secondary">
                            {formatTokens(stats.totalTokens)}
                          </td>
                          <td className="py-2.5 text-right text-text-primary font-medium">
                            {stats.costUsd === 0 ? (
                              <span className="text-emerald-400">Free</span>
                            ) : (
                              formatCost(stats.costUsd)
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Daily cost chart */}
          <Card>
            <h2 className="text-sm font-semibold text-text-primary mb-4">
              Daily cost
            </h2>
            {data.daily.length === 0 ? (
              <p className="text-sm text-text-muted py-8 text-center">
                No usage data for this period
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={data.daily}
                  margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="rgba(255,255,255,0.06)"
                  />
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
                    tickFormatter={(v: number) => `$${v.toFixed(2)}`}
                    width={52}
                  />
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  />
                  <Bar
                    dataKey="costUsd"
                    fill="var(--color-accent)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={32}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          {/* Feature breakdown table */}
          <Card>
            <h2 className="text-sm font-semibold text-text-primary mb-4">
              Cost by feature
            </h2>
            {Object.keys(data.byFeature).length === 0 ? (
              <p className="text-sm text-text-muted py-4 text-center">
                No feature data for this period
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-nativz-border text-text-muted text-xs">
                      <th className="text-left pb-2 font-medium">Feature</th>
                      <th className="text-left pb-2 font-medium">Model</th>
                      <th className="text-right pb-2 font-medium">Requests</th>
                      <th className="text-right pb-2 font-medium">Tokens</th>
                      <th className="text-right pb-2 font-medium">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(data.byFeature)
                      .sort(([, a], [, b]) => b.requests - a.requests)
                      .map(([feature, stats]) => (
                        <tr
                          key={feature}
                          className="border-b border-nativz-border/50 last:border-0"
                        >
                          <td className="py-2.5 text-text-secondary">
                            {feature.replace(/_/g, ' ')}
                          </td>
                          <td className="py-2.5 text-text-muted text-xs">
                            {modelLabel(stats.model)}
                          </td>
                          <td className="py-2.5 text-right text-text-secondary">
                            {formatNumber(stats.requests)}
                          </td>
                          <td className="py-2.5 text-right text-text-secondary">
                            {formatTokens(stats.totalTokens)}
                          </td>
                          <td className="py-2.5 text-right text-text-primary font-medium">
                            {stats.costUsd === 0 ? (
                              <span className="text-emerald-400">Free</span>
                            ) : (
                              formatCost(stats.costUsd)
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
