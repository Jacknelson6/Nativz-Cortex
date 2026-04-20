'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ZAxis,
  Legend,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface FrequencyRow {
  platform: string;
  postsPerWeek: number;
  avgEngagementRate: number;
  avgEngagement: number;
  weeksCount: number;
}

const PLATFORM_COLORS: Record<string, string> = {
  facebook: '#1877f2',
  instagram: '#e1306c',
  tiktok: '#22d3ee',
  youtube: '#ef4444',
  linkedin: '#0a66c2',
};
const PLATFORM_LABELS: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
};

export function PostingFrequencyChart({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<FrequencyRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams({ clientId });
    fetch(`/api/reporting/posting-frequency?${qs}`)
      .then((r) => (r.ok ? r.json() : { frequency: [] }))
      .then((d) => setRows(d.frequency ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [clientId]);

  const byPlatform = useMemo(() => {
    const m = new Map<string, FrequencyRow[]>();
    for (const r of rows) {
      const arr = m.get(r.platform) ?? [];
      arr.push(r);
      m.set(r.platform, arr);
    }
    return m;
  }, [rows]);

  if (!loading && rows.length === 0) {
    return (
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-text-primary">Posting frequency vs engagement</h3>
        <p className="text-xs text-text-muted mt-2">Not enough posting history yet.</p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-text-primary">Posting frequency vs engagement</h3>
        <p className="text-xs text-text-muted mt-0.5">
          Each dot is one week. Bigger = more weeks at that cadence.
        </p>
      </div>
      {loading ? (
        <Skeleton className="h-48" />
      ) : (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 5, right: 10, bottom: 20, left: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                type="number"
                dataKey="postsPerWeek"
                name="Posts / week"
                tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.55)' }}
                stroke="rgba(255,255,255,0.08)"
                label={{ value: 'Posts per week', position: 'insideBottom', offset: -10, fill: 'rgba(255,255,255,0.45)', fontSize: 11 }}
              />
              <YAxis
                type="number"
                dataKey="avgEngagementRate"
                name="ER %"
                tickFormatter={(v) => `${v.toFixed(1)}%`}
                tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.55)' }}
                stroke="rgba(255,255,255,0.08)"
                width={50}
              />
              <ZAxis type="number" dataKey="weeksCount" range={[40, 180]} name="Weeks" />
              <Tooltip
                cursor={{ strokeDasharray: '3 3', stroke: 'rgba(255,255,255,0.15)' }}
                contentStyle={{
                  background: 'rgba(15,17,22,0.97)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 8,
                  fontSize: 11,
                }}
                formatter={(v, n) => {
                  if (n === 'ER %') return [`${Number(v).toFixed(2)}%`, n];
                  return [String(v), n];
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11 }}
                formatter={(v) => PLATFORM_LABELS[String(v)] ?? v}
              />
              {[...byPlatform.entries()].map(([platform, data]) => (
                <Scatter
                  key={platform}
                  name={platform}
                  data={data}
                  fill={PLATFORM_COLORS[platform] ?? '#60a5fa'}
                  fillOpacity={0.8}
                />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
