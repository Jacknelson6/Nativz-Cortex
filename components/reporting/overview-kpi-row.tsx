'use client';

import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { MetricSparklineCard } from './metric-sparkline-card';
import type { MetricCard, SummaryReport, TimelinePost } from '@/lib/types/reporting';

/**
 * NAT-54 — 4-tile KPI row replacing the old `SummaryView` hero. Each tile
 * uses `MetricSparklineCard` so we get a 30-day sparkline + change chip for
 * free; when daily data isn't available (posts per day), the card gracefully
 * renders totals without a chart.
 */
interface OverviewKpiRowProps {
  data: SummaryReport | null;
  loading: boolean;
  /** Posts published in the window — rendered as markers on the Views /
   *  Engagement sparklines. */
  posts?: TimelinePost[];
}

function buildCardFromTotalAndSeries(
  total: number,
  seriesValues: Array<{ date: string; value: number }>,
): MetricCard {
  // Approximate prior-period total as the first series value (proxy — the
  // reporting endpoint already returns explicit changePercents on `combined`
  // for most metrics; for followers Δ which we derive ourselves, suppress
  // the delta chip unless we have enough signal).
  const previousTotal = seriesValues.length > 0 ? seriesValues[0].value : 0;
  const changePercent =
    previousTotal > 0 ? ((total - previousTotal) / previousTotal) * 100 : 0;
  return {
    total,
    previousTotal,
    changePercent,
    series: seriesValues,
  };
}

export function OverviewKpiRow({ data, loading, posts = [] }: OverviewKpiRowProps) {
  const cards = useMemo(() => {
    if (!data) return null;
    const chart = data.chart ?? [];

    const viewsSeries = chart.map((c) => ({ date: c.date, value: c.views }));
    const engagementSeries = chart.map((c) => ({ date: c.date, value: c.engagement }));

    // Followers Δ daily series — day-over-day change in cumulative followers.
    const followerDeltaSeries: Array<{ date: string; value: number }> = [];
    for (let i = 1; i < chart.length; i++) {
      const delta = chart[i].followers - chart[i - 1].followers;
      followerDeltaSeries.push({ date: chart[i].date, value: delta });
    }

    const totalFollowerChange = data.combined.totalFollowerChange ?? 0;
    const totalViews = data.combined.totalViews ?? 0;
    const totalEngagement = data.combined.totalEngagement ?? 0;
    const totalPosts = data.platforms.reduce((sum, p) => sum + (p.postsCount ?? 0), 0);

    const followers: MetricCard = {
      total: totalFollowerChange,
      previousTotal: 0,
      changePercent: 0,
      series: followerDeltaSeries,
    };

    const views: MetricCard = {
      total: totalViews,
      previousTotal: viewsSeries[0]?.value ?? 0,
      changePercent: data.combined.totalViewsChange ?? 0,
      series: viewsSeries,
    };

    const engagement: MetricCard = {
      total: totalEngagement,
      previousTotal: engagementSeries[0]?.value ?? 0,
      changePercent: data.combined.totalEngagementChange ?? 0,
      series: engagementSeries,
    };

    const postsCard: MetricCard = buildCardFromTotalAndSeries(totalPosts, []);

    return { followers, views, engagement, postsCard };
  }, [data]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
    );
  }

  if (!cards) {
    return (
      <Card>
        <p className="text-center text-text-muted py-8">
          No data available for this period
        </p>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <MetricSparklineCard
        label="Followers Δ"
        card={cards.followers}
        colorClass="#60a5fa"
      />
      <MetricSparklineCard
        label="Views"
        card={cards.views}
        colorClass="#34d399"
        posts={posts}
      />
      <MetricSparklineCard
        label="Engagement"
        card={cards.engagement}
        colorClass="#f472b6"
        posts={posts}
      />
      <MetricSparklineCard
        label="Posts"
        card={cards.postsCard}
        colorClass="#fbbf24"
      />
    </div>
  );
}
