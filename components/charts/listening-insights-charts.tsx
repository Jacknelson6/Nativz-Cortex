'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from 'recharts';
import { Card, CardTitle } from '@/components/ui/card';
import type { PlatformBreakdown } from '@/lib/types/search';
import type { TrendingTopic, LegacyTrendingTopic } from '@/lib/types/search';

const PLATFORM_COLORS: Record<string, string> = {
  web: '#046bd2',
  reddit: '#f97316',
  youtube: '#ef4444',
  tiktok: '#a855f7',
  quora: '#22c55e',
};

interface ListeningInsightsChartsProps {
  platformBreakdown?: PlatformBreakdown[] | null;
  trendingTopics?: (TrendingTopic | LegacyTrendingTopic)[] | null;
}

export function ListeningInsightsCharts({
  platformBreakdown,
  trendingTopics,
}: ListeningInsightsChartsProps) {
  const platformData = (platformBreakdown ?? [])
    .map((p) => ({
      name: p.platform,
      label: p.platform.charAt(0).toUpperCase() + p.platform.slice(1),
      total: p.post_count + p.comment_count,
      posts: p.post_count,
      comments: p.comment_count,
    }))
    .filter((d) => d.total > 0)
    .sort((a, b) => b.total - a.total);

  const topicData = (trendingTopics ?? [])
    .map((t) => ({
      name: t.name.length > 28 ? `${t.name.slice(0, 28)}…` : t.name,
      fullName: t.name,
      ideas: Array.isArray(t.video_ideas) ? t.video_ideas.length : 0,
      resonance: t.resonance,
    }))
    .filter((d) => d.ideas > 0)
    .sort((a, b) => b.ideas - a.ideas)
    .slice(0, 10);

  if (platformData.length === 0 && topicData.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {platformData.length > 0 ? (
        <Card>
          <CardTitle className="mb-1">Listening by platform</CardTitle>
          <p className="text-xs text-text-muted mb-4">Posts and comments gathered for this search</p>
          <div className="animate-fade-in">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={platformData} layout="vertical" margin={{ left: 8, right: 16, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2f45" horizontal={false} />
                <XAxis type="number" stroke="#6b7280" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={72}
                  stroke="#6b7280"
                  tick={{ fill: '#9ca3af', fontSize: 11 }}
                />
                <Tooltip
                  content={({ payload }) => {
                    const row = payload?.[0]?.payload as
                      | { label: string; total: number; posts: number; comments: number }
                      | undefined;
                    if (!row) return null;
                    return (
                      <div
                        className="rounded-lg border border-nativz-border px-3 py-2 text-xs shadow-lg"
                        style={{ background: '#151822' }}
                      >
                        <p className="font-medium text-text-primary">{row.label}</p>
                        <p className="text-text-muted mt-0.5">
                          {row.total} signals · {row.posts} posts · {row.comments} comments
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="total" name="Signals" radius={[0, 6, 6, 0]} maxBarSize={28}>
                  {platformData.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={PLATFORM_COLORS[entry.name] ?? '#046bd2'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      ) : null}

      {topicData.length > 0 ? (
        <Card>
          <CardTitle className="mb-1">Topic idea density</CardTitle>
          <p className="text-xs text-text-muted mb-4">Video angles generated per trending topic</p>
          <div className="animate-fade-in">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={topicData} margin={{ left: 4, right: 16, top: 8, bottom: 48 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2f45" vertical={false} />
                <XAxis
                  dataKey="name"
                  stroke="#6b7280"
                  tick={{ fill: '#9ca3af', fontSize: 10 }}
                  interval={0}
                  angle={-32}
                  textAnchor="end"
                  height={56}
                />
                <YAxis stroke="#6b7280" tick={{ fill: '#9ca3af', fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  content={({ payload }) => {
                    const row = payload?.[0]?.payload as
                      | { fullName?: string; ideas: number }
                      | undefined;
                    if (!row) return null;
                    return (
                      <div
                        className="rounded-lg border border-nativz-border px-3 py-2 text-xs shadow-lg"
                        style={{ background: '#151822' }}
                      >
                        <p className="font-medium text-text-primary">{row.fullName}</p>
                        <p className="text-text-muted mt-0.5">{row.ideas} video angles</p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="ideas" name="Ideas" fill="#8b5cf6" radius={[6, 6, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
