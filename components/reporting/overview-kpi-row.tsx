'use client';

import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { MetricSparklineCard } from './metric-sparkline-card';
import type { DateRange, MetricCard, SummaryReport, TimelinePost } from '@/lib/types/reporting';

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
  /** Comparison summary (same shape, different date range). When present, each
   *  tile shows real delta-vs-prior and a ghost dashed line overlay. */
  compareData?: SummaryReport | null;
  /** The compare range — surfaces as "vs Feb 23 – Mar 22" on each tile. */
  compareRange?: DateRange | null;
}

function fmtRange(range: DateRange): string {
  const fmt = (s: string) =>
    new Date(`${s}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `vs ${fmt(range.start)} – ${fmt(range.end)}`;
}

function changePct(current: number, previous: number): number {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
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

export function OverviewKpiRow({
  data,
  loading,
  posts = [],
  compareData = null,
  compareRange = null,
}: OverviewKpiRowProps) {
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

    // Compare-period totals. When compareData is set, all four tiles recompute
    // their delta against these values instead of the self-referential "first
    // series point" proxy used when no comparison is selected.
    const compareChart = compareData?.chart ?? [];
    const compareFollowers = compareData?.combined.totalFollowerChange ?? 0;
    const compareViews = compareData?.combined.totalViews ?? 0;
    const compareEngagement = compareData?.combined.totalEngagement ?? 0;
    const comparePosts = compareData?.platforms.reduce((sum, p) => sum + (p.postsCount ?? 0), 0) ?? 0;
    const compareViewsSeries = compareChart.map((c) => ({ date: c.date, value: c.views }));
    const compareEngagementSeries = compareChart.map((c) => ({ date: c.date, value: c.engagement }));
    const compareFollowerSeries: Array<{ date: string; value: number }> = [];
    for (let i = 1; i < compareChart.length; i++) {
      const delta = compareChart[i].followers - compareChart[i - 1].followers;
      compareFollowerSeries.push({ date: compareChart[i].date, value: delta });
    }

    const followers: MetricCard = {
      total: totalFollowerChange,
      previousTotal: compareData ? compareFollowers : 0,
      changePercent: compareData ? changePct(totalFollowerChange, compareFollowers) : 0,
      series: followerDeltaSeries,
    };

    const views: MetricCard = {
      total: totalViews,
      previousTotal: compareData ? compareViews : viewsSeries[0]?.value ?? 0,
      changePercent: compareData
        ? changePct(totalViews, compareViews)
        : data.combined.totalViewsChange ?? 0,
      series: viewsSeries,
    };

    const engagement: MetricCard = {
      total: totalEngagement,
      previousTotal: compareData ? compareEngagement : engagementSeries[0]?.value ?? 0,
      changePercent: compareData
        ? changePct(totalEngagement, compareEngagement)
        : data.combined.totalEngagementChange ?? 0,
      series: engagementSeries,
    };

    const postsCard: MetricCard = compareData
      ? {
          total: totalPosts,
          previousTotal: comparePosts,
          changePercent: changePct(totalPosts, comparePosts),
          series: [],
        }
      : buildCardFromTotalAndSeries(totalPosts, []);

    return {
      followers,
      views,
      engagement,
      postsCard,
      compareFollowerSeries,
      compareViewsSeries,
      compareEngagementSeries,
    };
  }, [data, compareData]);

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

  const compareLabel = compareData && compareRange ? fmtRange(compareRange) : undefined;

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <MetricSparklineCard
        label="Followers Δ"
        card={cards.followers}
        colorClass="#60a5fa"
        compareSeries={cards.compareFollowerSeries}
        compareLabel={compareLabel}
      />
      <MetricSparklineCard
        label="Views"
        card={cards.views}
        colorClass="#34d399"
        posts={posts}
        compareSeries={cards.compareViewsSeries}
        compareLabel={compareLabel}
      />
      <MetricSparklineCard
        label="Engagement"
        card={cards.engagement}
        colorClass="#f472b6"
        posts={posts}
        compareSeries={cards.compareEngagementSeries}
        compareLabel={compareLabel}
      />
      <MetricSparklineCard
        label="Posts"
        card={cards.postsCard}
        colorClass="#fbbf24"
        compareLabel={compareLabel}
      />
    </div>
  );
}
