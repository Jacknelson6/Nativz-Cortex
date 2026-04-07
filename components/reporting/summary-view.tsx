'use client';

import { Eye, UserPlus, Heart, TrendingUp, Users } from 'lucide-react';
import { StatCard } from '@/components/shared/stat-card';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { SummaryReport } from '@/lib/types/reporting';

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

interface SummaryViewProps {
  data: SummaryReport | null;
  loading: boolean;
}

export function SummaryView({ data, loading }: SummaryViewProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <Card>
        <p className="text-center text-text-muted py-8">
          No data available for this period
        </p>
      </Card>
    );
  }

  const { combined } = data;

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
      <StatCard
        title="Total followers"
        value={formatNumber(combined.totalFollowers ?? 0)}
        icon={<Users size={20} />}
      />
      <StatCard
        title="Total views"
        value={formatNumber(combined.totalViews ?? 0)}
        change={combined.totalViewsChange ?? undefined}
        icon={<Eye size={20} />}
      />
      <StatCard
        title="Followers gained"
        value={formatNumber(combined.totalFollowerChange ?? 0)}
        change={combined.totalFollowerChangeChange ?? undefined}
        icon={<UserPlus size={20} />}
      />
      <StatCard
        title="Total engagement"
        value={formatNumber(combined.totalEngagement ?? 0)}
        change={combined.totalEngagementChange ?? undefined}
        icon={<Heart size={20} />}
      />
      <StatCard
        title="Avg engagement rate"
        value={`${(combined.avgEngagementRate ?? 0).toFixed(2)}%`}
        change={combined.avgEngagementRateChange ?? undefined}
        icon={<TrendingUp size={20} />}
      />
    </div>
  );
}
