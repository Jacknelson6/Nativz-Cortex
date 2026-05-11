'use client';

// ZNA-02: three-series growth chart (followers + rolling 7d views + rolling
// 7d engagements). Each series uses its own Y axis so a high-volume signal
// like TikTok views doesn't flatten the followers line into a flat strip.

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { TimeseriesPoint } from '@/lib/analytics/types';

interface Props {
  points: TimeseriesPoint[];
  height?: number;
}

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

interface TooltipPayloadEntry {
  value: number;
  name: string;
  color: string;
}
interface RechartsTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}

function ChartTooltip({ active, payload, label }: RechartsTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border border-white/10 bg-zinc-900/95 backdrop-blur px-3 py-2 text-xs shadow-xl">
      <div className="text-white/70 mb-1">{label ? formatDate(label) : ''}</div>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: entry.color }} />
          <span className="text-white/80">{entry.name}</span>
          <span className="text-white">{compact.format(entry.value ?? 0)}</span>
        </div>
      ))}
    </div>
  );
}

export function ZernioGrowthChart({ points, height = 240 }: Props) {
  if (points.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          stroke="rgba(255,255,255,0.4)"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          minTickGap={24}
        />
        <YAxis
          yAxisId="followers"
          orientation="left"
          stroke="rgba(255,255,255,0.3)"
          fontSize={11}
          tickFormatter={(v: number) => compact.format(v)}
          tickLine={false}
          axisLine={false}
          width={40}
        />
        <YAxis
          yAxisId="views"
          orientation="right"
          stroke="rgba(255,255,255,0.3)"
          fontSize={11}
          tickFormatter={(v: number) => compact.format(v)}
          tickLine={false}
          axisLine={false}
          width={40}
        />
        <YAxis yAxisId="engagements" hide />
        <Tooltip content={<ChartTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', paddingTop: 8 }}
          iconType="circle"
        />
        <Line
          name="Followers"
          type="monotone"
          dataKey="followers"
          yAxisId="followers"
          stroke="#60a5fa"
          strokeWidth={2}
          dot={false}
        />
        <Line
          name="Views (7d avg)"
          type="monotone"
          dataKey="views_rolling_7d"
          yAxisId="views"
          stroke="#34d399"
          strokeWidth={2}
          dot={false}
        />
        <Line
          name="Engagements (7d avg)"
          type="monotone"
          dataKey="engagements_rolling_7d"
          yAxisId="engagements"
          stroke="#c4b5fd"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
