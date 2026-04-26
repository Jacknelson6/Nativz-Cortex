'use client';

import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { MetricSparklineCard } from './metric-sparkline-card';
import type { DateRange, MetricCard, SummaryReport } from '@/lib/types/reporting';

/**
 * 3-tile KPI row: Followers Δ, Views, Engagement. Posts count was removed
 * 2026-04-21 per Jack — it added noise without answering a useful question.
 */
interface OverviewKpiRowProps {
  data: SummaryReport | null;
  loading: boolean;
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

export function OverviewKpiRow({
  data,
  loading,
  compareData = null,
  compareRange = null,
}: OverviewKpiRowProps) {
  const cards = useMemo(() => {
    if (!data) return null;
    const chart = data.chart ?? [];

    const viewsSeries = chart.map((c) => ({ date: c.date, value: c.views }));
    const engagementSeries = chart.map((c) => ({ date: c.date, value: c.engagement }));

    // Followers Δ daily series — day-over-day change in cumulative followers
    // across every connected profile. If `chart.followers` is absent the
    // series ends up empty and the sparkline hides itself.
    const followerDeltaSeries: Array<{ date: string; value: number }> = [];
    for (let i = 1; i < chart.length; i++) {
      const delta = (chart[i].followers ?? 0) - (chart[i - 1].followers ?? 0);
      followerDeltaSeries.push({ date: chart[i].date, value: delta });
    }

    // Sum the explicit per-platform followerChange when `combined` is empty —
    // keeps the tile honest when Zernio doesn't surface a rolled-up delta.
    const summedPlatformFollowerChange = (data.platforms ?? []).reduce(
      (sum, p) => sum + (p.followerChange ?? 0),
      0,
    );
    const totalFollowerChange =
      data.combined.totalFollowerChange ?? summedPlatformFollowerChange ?? 0;
    const totalViews = data.combined.totalViews ?? 0;
    const totalEngagement = data.combined.totalEngagement ?? 0;

    const compareChart = compareData?.chart ?? [];
    const compareFollowersSummed = (compareData?.platforms ?? []).reduce(
      (sum, p) => sum + (p.followerChange ?? 0),
      0,
    );
    const compareFollowers =
      compareData?.combined.totalFollowerChange ?? compareFollowersSummed ?? 0;
    const compareViews = compareData?.combined.totalViews ?? 0;
    const compareEngagement = compareData?.combined.totalEngagement ?? 0;
    const compareViewsSeries = compareChart.map((c) => ({ date: c.date, value: c.views }));
    const compareEngagementSeries = compareChart.map((c) => ({ date: c.date, value: c.engagement }));
    const compareFollowerSeries: Array<{ date: string; value: number }> = [];
    for (let i = 1; i < compareChart.length; i++) {
      const delta = (compareChart[i].followers ?? 0) - (compareChart[i - 1].followers ?? 0);
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

    return {
      followers,
      views,
      engagement,
      compareFollowerSeries,
      compareViewsSeries,
      compareEngagementSeries,
    };
  }, [data, compareData]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <MetricSparklineCard
        label="New followers"
        card={cards.followers}
        compareSeries={cards.compareFollowerSeries}
        compareLabel={compareLabel}
      />
      <MetricSparklineCard
        label="Views"
        card={cards.views}
        compareSeries={cards.compareViewsSeries}
        compareLabel={compareLabel}
      />
      <MetricSparklineCard
        label="Engagement"
        card={cards.engagement}
        compareSeries={cards.compareEngagementSeries}
        compareLabel={compareLabel}
      />
    </div>
  );
}
