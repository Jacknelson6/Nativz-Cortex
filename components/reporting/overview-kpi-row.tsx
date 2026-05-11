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

    // Followers Δ daily series. The server already sends `chart.followers`
    // as a per-day gain (sum of `followers_change` clamped to >=0), so we
    // map it through directly — diffing it again here was producing the
    // delta-of-a-delta and surfacing wildly wrong tooltip values.
    const followerDeltaSeries = chart.map((c) => ({
      date: c.date,
      value: Math.max(0, c.followers ?? 0),
    }));

    // Prefer the gross-follows rollup (matches Meta Business Suite's
    // "Follows" number for IG/FB). Fall back to summed per-platform gross
    // when available, then summed net follower change. The fallback chain
    // keeps the tile honest for accounts that only expose net (YT/LI/TikTok).
    const summedPlatformGrossFollows = (data.platforms ?? []).reduce(
      (sum, p) => sum + Math.max(0, p.newFollows ?? p.followerChange ?? 0),
      0,
    );
    const totalFollowerChange =
      data.combined.totalNewFollows ?? summedPlatformGrossFollows ?? 0;
    const totalViews = data.combined.totalViews ?? 0;
    const totalEngagement = data.combined.totalEngagement ?? 0;

    const compareChart = compareData?.chart ?? [];
    const compareFollowersSummed = (compareData?.platforms ?? []).reduce(
      (sum, p) => sum + (p.newFollows ?? p.followerChange ?? 0),
      0,
    );
    const compareFollowers =
      compareData?.combined.totalNewFollows ?? compareFollowersSummed ?? 0;
    const compareViews = compareData?.combined.totalViews ?? 0;
    const compareEngagement = compareData?.combined.totalEngagement ?? 0;
    const compareViewsSeries = compareChart.map((c) => ({ date: c.date, value: c.views }));
    const compareEngagementSeries = compareChart.map((c) => ({ date: c.date, value: c.engagement }));
    // Same fix as the primary series: `compareChart.followers` is already
    // a per-day delta, so map it through directly.
    const compareFollowerSeries = compareChart.map((c) => ({
      date: c.date,
      value: Math.max(0, c.followers ?? 0),
    }));

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
