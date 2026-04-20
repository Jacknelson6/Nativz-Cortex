'use client';

import { Card } from '@/components/ui/card';
import { PlatformBadge } from './platform-badge';
import type { PlatformBreakdownRow, SocialPlatform } from '@/lib/types/reporting';

function formatNumber(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

interface PlatformBreakdownTableProps {
  rows: PlatformBreakdownRow[];
}

export function PlatformBreakdownTable({ rows }: PlatformBreakdownTableProps) {
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => b.followers - a.followers);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-nativz-border/70">
        <h3 className="text-sm font-semibold text-text-primary">Platform breakdown</h3>
        <span className="text-xs text-text-muted">{rows.length} network{rows.length === 1 ? '' : 's'}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-text-muted/70 border-b border-nativz-border/50">
              <th className="text-left font-medium px-5 py-2">Platform</th>
              <th className="text-right font-medium px-3 py-2">Followers</th>
              <th className="text-right font-medium px-3 py-2">Gained</th>
              <th className="text-right font-medium px-3 py-2">Posts</th>
              <th className="text-right font-medium px-3 py-2">Views</th>
              <th className="text-right font-medium px-3 py-2">Engagement</th>
              <th className="text-right font-medium px-5 py-2">ER</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-nativz-border/50">
            {sorted.map((r) => (
              <tr key={`${r.platform}-${r.username}`} className="hover:bg-surface-hover/40 transition-colors">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <PlatformBadge platform={r.platform as SocialPlatform} showLabel={false} size="sm" />
                    <span className="text-text-primary font-medium">
                      {r.platform.charAt(0).toUpperCase() + r.platform.slice(1)}
                    </span>
                    {r.username && <span className="text-text-muted text-xs">@{r.username}</span>}
                  </div>
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-text-primary font-medium">
                  {formatNumber(r.followers)}
                </td>
                <td className={`px-3 py-3 text-right tabular-nums ${r.followerChange > 0 ? 'text-emerald-400' : r.followerChange < 0 ? 'text-red-400' : 'text-text-muted'}`}>
                  {r.followerChange > 0 ? '+' : ''}{r.followerChange}
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-text-muted">{r.postsCount}</td>
                <td className="px-3 py-3 text-right tabular-nums text-text-primary">{formatNumber(r.views)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-text-primary">{formatNumber(r.engagement)}</td>
                <td className="px-5 py-3 text-right tabular-nums text-text-primary">{r.engagementRate.toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
