'use client';

import { Info } from 'lucide-react';
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

const SPARKLINE_COLOR = 'var(--accent-text)';

// Metrics the platform genuinely doesn't expose — calling them out keeps the
// dashboard honest. Sourced from Zernio's data engineer (Miki, 2026-04-26):
// TikTok's public API has no account-level watch time/impressions/profile
// views; YouTube Analytics API v2 doesn't surface Studio impressions or CTR;
// Instagram returns net follower delta only, not the daily add/remove split.
const UNAVAILABLE_METRICS: Record<string, Array<{ label: string; reason: string }>> = {
  tiktok: [
    { label: 'Watch time', reason: 'Not exposed by TikTok’s public API' },
    { label: 'Impressions', reason: 'Account-level impressions aren’t available' },
    { label: 'Profile views', reason: 'Not exposed by TikTok’s public API' },
  ],
  youtube: [
    { label: 'Impressions / CTR', reason: 'YouTube Analytics API v2 doesn’t return Studio impression or CTR data' },
  ],
  instagram: [
    { label: 'Daily follows / unfollows', reason: 'Instagram returns net follower count only, not the daily add/remove split' },
  ],
};

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
  const unavailable = UNAVAILABLE_METRICS[summary.platform] ?? [];
  // Show gross follow / unfollow events when the platform reports them.
  // YouTube returns subscribers gained/lost, Instagram returns gross follow
  // events and unfollow events. Net change becomes interpretable instead of
  // a single number that hides churn.
  const hasFlowData = summary.newFollows != null || (summary.unfollows ?? 0) > 0;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <PlatformBadge platform={summary.platform as SocialPlatform} showLabel={false} size="sm" />
        <h3 className="ui-section-title">{label}</h3>
        {summary.username && (
          <span className="text-sm text-text-muted">@{summary.username}</span>
        )}
        {hasFlowData && (
          <span className="ml-auto inline-flex items-center gap-2 rounded-full border border-nativz-border/70 bg-background/40 px-3 py-1 text-xs tabular-nums text-text-secondary">
            {summary.newFollows != null && (
              <span className="text-text-primary">
                +{summary.newFollows.toLocaleString()} <span className="text-text-muted">follows</span>
              </span>
            )}
            {(summary.unfollows ?? 0) > 0 && (
              <>
                <span aria-hidden className="text-text-muted/60">·</span>
                <span className="text-text-primary">
                  −{summary.unfollows!.toLocaleString()} <span className="text-text-muted">unfollows</span>
                </span>
              </>
            )}
          </span>
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

      {unavailable.length > 0 && (
        <div className="rounded-lg border border-dashed border-nativz-border/60 bg-background/40 p-3 text-xs text-text-muted">
          <div className="mb-1.5 flex items-center gap-1.5 font-medium uppercase tracking-wide">
            <Info size={12} aria-hidden /> Not available from {label}
          </div>
          <ul className="space-y-1">
            {unavailable.map((m) => (
              <li key={m.label}>
                <span className="text-text-secondary">{m.label}</span> — {m.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
