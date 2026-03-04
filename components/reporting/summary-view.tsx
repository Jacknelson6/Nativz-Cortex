'use client';

import { Eye, UserPlus, Heart, TrendingUp } from 'lucide-react';
import { StatCard } from '@/components/shared/stat-card';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PlatformBadge } from './platform-badge';
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
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-64" />
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

  const { combined, platforms } = data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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

      {(platforms ?? []).length > 0 && (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-nativz-border">
                  <th className="px-4 py-3 text-left text-text-muted font-medium">
                    Platform
                  </th>
                  <th className="px-4 py-3 text-right text-text-muted font-medium">
                    Followers
                  </th>
                  <th className="px-4 py-3 text-right text-text-muted font-medium">
                    Change
                  </th>
                  <th className="px-4 py-3 text-right text-text-muted font-medium">
                    Views
                  </th>
                  <th className="px-4 py-3 text-right text-text-muted font-medium">
                    Engagement
                  </th>
                  <th className="px-4 py-3 text-right text-text-muted font-medium">
                    Rate
                  </th>
                </tr>
              </thead>
              <tbody>
                {(platforms ?? []).map((p) => (
                  <tr
                    key={p.platform}
                    className="border-b border-nativz-border last:border-b-0 hover:bg-surface-hover/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <PlatformBadge platform={p.platform} showLabel={false} size="sm" />
                        <span className="text-text-primary">
                          {p.username ?? p.platform}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-text-primary">
                      {formatNumber(p.followers ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={
                          (p.followerChange ?? 0) >= 0
                            ? 'text-emerald-400'
                            : 'text-red-400'
                        }
                      >
                        {(p.followerChange ?? 0) >= 0 ? '+' : ''}
                        {formatNumber(p.followerChange ?? 0)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-text-primary">
                      {formatNumber(p.totalViews ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-right text-text-primary">
                      {formatNumber(p.totalEngagement ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-right text-text-primary">
                      {(p.engagementRate ?? 0).toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
