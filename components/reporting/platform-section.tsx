'use client';

import { PlatformGlyph } from '@/components/integrations/platform-glyph';
import { MetricSparklineCard } from './metric-sparkline-card';
import type { ChartDataPoint, PlatformSummary, SocialPlatform } from '@/lib/types/reporting';

const PLATFORM_LABELS: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
};

const SPARKLINE_COLOR = 'var(--accent-text)';

interface PlatformSectionProps {
  summary: PlatformSummary;
  // Kept for backwards compatibility with the parent dashboard; unused now
  // that each metric card carries its own sparkline.
  chartData?: ChartDataPoint[];
  /** Same-platform summary from the prior window — its metric series feed the
   *  ghost dashed line on each sparkline. */
  compareSummary?: PlatformSummary | null;
  /** Pre-formatted "vs Feb 23 – Mar 22" string from the parent dashboard. */
  compareLabel?: string;
}

export function PlatformSection({ summary, compareSummary, compareLabel }: PlatformSectionProps) {
  const label = PLATFORM_LABELS[summary.platform] ?? summary.platform;
  const color = SPARKLINE_COLOR;
  const m = summary.metrics ?? {};

  // Cards with no data (undefined) are filtered out so platforms like
  // Facebook don't show zeroed-out "Profile visits" cards that Zernio
  // can't fill. All surviving cards share one platform-brand colour so
  // the eye can scan a client page and tell networks apart without
  // reading every label.
  type MetricKey = keyof NonNullable<PlatformSummary['metrics']>;
  type MetricCardValue = NonNullable<PlatformSummary['metrics']>[MetricKey];

  const cards: Array<{
    key: MetricKey;
    label: string;
    card: MetricCardValue;
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
  const compareMetrics = compareSummary?.metrics ?? null;

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <PlatformGlyph platform={summary.platform as SocialPlatform} size={18} colorClass="text-text-secondary" />
        <h3 className="ui-section-title">{label}</h3>
        {summary.username && (
          <span className="text-sm text-text-muted">@{summary.username}</span>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-nativz-border bg-surface p-6 text-center text-sm text-text-muted">
          No data available for this platform in the selected window.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((c) => {
            const compareCard = compareMetrics ? compareMetrics[c.key] : undefined;
            return (
              <MetricSparklineCard
                key={c.key}
                label={c.label}
                card={c.card!}
                format={c.format ?? 'number'}
                colorClass={color}
                compareSeries={compareCard?.series}
                compareLabel={compareLabel}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
