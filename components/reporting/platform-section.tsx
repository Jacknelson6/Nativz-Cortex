'use client';

import { Eye, UserPlus, Heart, TrendingUp, FileText } from 'lucide-react';
import { StatCard } from '@/components/shared/stat-card';
import { GrowthChart } from './growth-chart';
import { PlatformBadge } from './platform-badge';
import type { PlatformSummary, ChartDataPoint, SocialPlatform } from '@/lib/types/reporting';

const PLATFORM_LABELS: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
};

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

interface PlatformSectionProps {
  summary: PlatformSummary;
  chartData: ChartDataPoint[];
}

export function PlatformSection({ summary, chartData }: PlatformSectionProps) {
  const label = PLATFORM_LABELS[summary.platform] ?? summary.platform;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <PlatformBadge
          platform={summary.platform as SocialPlatform}
          showLabel={false}
          size="sm"
        />
        <h3 className="text-lg font-semibold text-text-primary">{label}</h3>
        {summary.username && (
          <span className="text-sm text-text-muted">@{summary.username}</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <StatCard
          title="Followers"
          value={formatNumber(summary.followers)}
          icon={<UserPlus size={18} />}
        />
        <StatCard
          title="Views"
          value={formatNumber(summary.totalViews)}
          icon={<Eye size={18} />}
        />
        <StatCard
          title="Followers gained"
          value={formatNumber(summary.followerChange)}
          icon={<UserPlus size={18} />}
        />
        <StatCard
          title="Engagement"
          value={formatNumber(summary.totalEngagement)}
          icon={<Heart size={18} />}
        />
        <StatCard
          title="Engagement rate"
          value={`${summary.engagementRate.toFixed(2)}%`}
          icon={<TrendingUp size={18} />}
        />
      </div>

      {chartData.length > 0 && (
        <GrowthChart data={chartData} loading={false} />
      )}
    </div>
  );
}
