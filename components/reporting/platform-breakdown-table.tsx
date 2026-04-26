'use client';

import { Card } from '@/components/ui/card';
import { TikTokMark } from '@/components/integrations/tiktok-mark';
import { InstagramMark } from '@/components/integrations/instagram-mark';
import { FacebookMark } from '@/components/integrations/facebook-mark';
import { YouTubeMark } from '@/components/integrations/youtube-mark';
import { LinkedInMark } from '@/components/integrations/linkedin-mark';
import type { PlatformBreakdownRow, SocialPlatform } from '@/lib/types/reporting';

function formatNumber(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

/** Format seconds as "12m" / "1h 23m" / "12:03" depending on magnitude. */
function formatWatchTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remainder = mins % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

/** Format a short "avg view" like 14s or 1:23 for longer. */
function formatAvgDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const PLATFORM_LABELS: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
};

function PlatformIcon({ platform }: { platform: SocialPlatform }) {
  const size = 20;
  switch (platform) {
    case 'tiktok':
      return <TikTokMark size={size} variant="auto" />;
    case 'instagram':
      return <InstagramMark size={size} variant="full" />;
    case 'facebook':
      return <FacebookMark size={size} variant="full" />;
    case 'youtube':
      return <YouTubeMark size={size} variant="full" />;
    case 'linkedin':
      return <LinkedInMark size={size} variant="full" />;
    default:
      return null;
  }
}

/**
 * Compute engagement rate from the raw totals.
 *
 * Formula priority:
 *   1. engagement / views × 100  — universal, stable across account size
 *   2. engagement / followers × 100  — fallback when we don't have views (rare)
 *   3. the stored rate as last resort
 *
 * We previously used engagement/followers for everything, which produced
 * absurd numbers like 768% ER on a 50-follower TikTok — correct math,
 * useless signal. ER by views is what TikTok, YouTube, and IG analytics
 * dashboards actually show, and it doesn't blow up for small accounts.
 */
function computeEngagementRate(row: PlatformBreakdownRow): number {
  if (row.views > 0) {
    return (row.engagement / row.views) * 100;
  }
  if (row.followers > 0) {
    return (row.engagement / row.followers) * 100;
  }
  return row.engagementRate ?? 0;
}

interface PlatformBreakdownTableProps {
  rows: PlatformBreakdownRow[];
}

export function PlatformBreakdownTable({ rows }: PlatformBreakdownTableProps) {
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => b.followers - a.followers);

  // Only show the video columns when at least one platform reports watch time.
  // Keeps the table visually quieter for clients without YouTube.
  const hasVideoData = sorted.some(
    (r) => (r.watchTimeSeconds ?? 0) > 0 || (r.avgViewDurationSeconds ?? 0) > 0,
  );
  // Unfollows column only shows when at least one platform reports a number.
  // YT (subscribers lost) + IG (unfollow events) both populate this; FB/TikTok
  // / LinkedIn don't, so the column self-hides for clients on those alone.
  const hasUnfollowsData = sorted.some((r) => (r.unfollows ?? 0) > 0);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-nativz-border/70">
        <h3 className="ui-card-title">Platform breakdown</h3>
        <span className="text-xs text-text-muted">{rows.length} network{rows.length === 1 ? '' : 's'}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-text-muted/70 border-b border-nativz-border/50">
              <th className="text-left font-medium px-5 py-2">Platform</th>
              <th className="text-right font-medium px-3 py-2">Followers</th>
              <th
                className="text-right font-medium px-3 py-2"
                title="Gross follow events in the window (matches Meta Business Suite 'Follows'). Instagram returns this directly; other platforms fall back to net follower change."
              >
                Follows
              </th>
              {hasUnfollowsData && (
                <th
                  className="text-right font-medium px-3 py-2"
                  title="Unfollow events in the window. YouTube reports subscribers lost; Instagram reports unfollows. Other networks don't expose this signal."
                >
                  Unfollows
                </th>
              )}
              <th className="text-right font-medium px-3 py-2">Posts</th>
              <th className="text-right font-medium px-3 py-2">Views</th>
              {hasVideoData && (
                <>
                  <th
                    className="text-right font-medium px-3 py-2"
                    title="Total watch time across all videos in the window. YouTube only — Zernio doesn't expose this for TikTok or Instagram."
                  >
                    Watch time
                  </th>
                  <th
                    className="text-right font-medium px-3 py-2"
                    title="View-weighted average watch duration per video. YouTube only."
                  >
                    Avg view
                  </th>
                </>
              )}
              <th className="text-right font-medium px-3 py-2">Engagement</th>
              <th className="text-right font-medium px-5 py-2">ER</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-nativz-border/50">
            {sorted.map((r) => {
              const er = computeEngagementRate(r);
              const label = PLATFORM_LABELS[r.platform] ?? r.platform;
              const watchTime = r.watchTimeSeconds ?? 0;
              const avgDur = r.avgViewDurationSeconds ?? 0;
              return (
                <tr key={`${r.platform}-${r.username}`} className="hover:bg-surface-hover/40 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <PlatformIcon platform={r.platform as SocialPlatform} />
                      <span className="text-text-primary font-medium">{label}</span>
                      {r.username && <span className="text-text-muted text-xs">@{r.username}</span>}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-text-primary font-medium">
                    {formatNumber(r.followers)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-text-primary">
                    {r.newFollows != null
                      ? formatNumber(r.newFollows)
                      : `${r.followerChange > 0 ? '+' : ''}${r.followerChange}`}
                  </td>
                  {hasUnfollowsData && (
                    <td className="px-3 py-3 text-right tabular-nums text-text-muted">
                      {r.unfollows != null && r.unfollows > 0
                        ? `−${formatNumber(r.unfollows)}`
                        : <span className="text-text-muted/60">—</span>}
                    </td>
                  )}
                  <td className="px-3 py-3 text-right tabular-nums text-text-muted">{r.postsCount}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-text-primary">{formatNumber(r.views)}</td>
                  {hasVideoData && (
                    <>
                      <td className="px-3 py-3 text-right tabular-nums text-text-primary">
                        {watchTime > 0 ? formatWatchTime(watchTime) : <span className="text-text-muted/60">—</span>}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-text-primary">
                        {avgDur > 0 ? formatAvgDuration(avgDur) : <span className="text-text-muted/60">—</span>}
                      </td>
                    </>
                  )}
                  <td className="px-3 py-3 text-right tabular-nums text-text-primary">{formatNumber(r.engagement)}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-text-primary">{er.toFixed(2)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
