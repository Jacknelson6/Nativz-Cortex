'use client';

import { PlatformBadge } from './platform-badge';
import { MetricSparklineCard } from './metric-sparkline-card';
import type { ChartDataPoint, PlatformSummary, SocialPlatform } from '@/lib/types/reporting';

const PLATFORM_LABELS: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
};

// Unified neutral-blue line per Jack's 2026-04-21 analytics ask — the
// rainbow per-platform colours (IG pink, TikTok cyan, YouTube red) read
// as noise next to the Meta Ads reporting page. Platform identity is
// carried by the branded icon in the header instead.
const SPARKLINE_COLOR = '#60a5fa';

interface PlatformSectionProps {
  summary: PlatformSummary;
  // Kept for backwards compatibility with the parent dashboard; unused now
  // that each metric card carries its own sparkline.
  chartData?: ChartDataPoint[];
}

export function PlatformSection({ summary }: PlatformSectionProps) {
  const label = PLATFORM_LABELS[summary.platform] ?? summary.platform;
  const color = SPARKLINE_COLOR;
  const m = summary.metrics ?? {};

  // Cards with no data (undefined) are filtered out so platforms like
  // Facebook don't show zeroed-out "Profile visits" cards that Zernio
  // can't fill. All surviving cards share one platform-brand colour so
  // the eye can scan a client page and tell networks apart without
  // reading every label.
  const cards: Array<{
    key: string;
    label: string;
    card: NonNullable<PlatformSummary['metrics']>[keyof NonNullable<PlatformSummary['metrics']>];
    format?: 'number' | 'percent';
  }> = [
    { key: 'views', label: 'Views', card: m.views },
    { key: 'engagement', label: 'Engagement', card: m.engagement },
    { key: 'engagementRate', label: 'Engagement rate', card: m.engagementRate, format: 'percent' },
    { key: 'followersGained', label: 'Followers gained', card: m.followersGained },
    { key: 'reach', label: 'Reach', card: m.reach },
    { key: 'impressions', label: 'Impressions', card: m.impressions },
    { key: 'profileVisits', label: 'Profile visits', card: m.profileVisits },
  ];

  const visible = cards.filter((c) => c.card !== undefined);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <PlatformBadge platform={summary.platform as SocialPlatform} showLabel={false} size="sm" />
        <h3 className="text-lg font-semibold text-text-primary">{label}</h3>
        {summary.username && (
          <span className="text-sm text-text-muted">@{summary.username}</span>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-nativz-border bg-surface p-6 text-center text-sm text-text-muted">
          No data available from Zernio for this platform in the selected window.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((c) => (
            <MetricSparklineCard
              key={c.key}
              label={c.label}
              card={c.card!}
              format={c.format ?? 'number'}
              colorClass={color}
              posts={summary.posts ?? []}
            />
          ))}
        </div>
      )}
    </section>
  );
}
