'use client';

import { useEffect, useState } from 'react';
import { Users2 } from 'lucide-react';
import { PlatformBadge } from './platform-badge';
import type { SocialPlatform } from '@/lib/types/reporting';

interface Bucket { name: string; percent: number }

interface Insight {
  platform: string;
  username: string;
  followersTotal: number | null;
  followersCountry: Bucket[];
  followersCity: Bucket[];
  followersAge: Bucket[];
  followersGender: Bucket[];
  reach: number | null;
  impressions: number | null;
}

interface AudienceInsightsCardProps {
  clientId: string;
}

/**
 * Pulls Zernio audience insights for every connected profile. The Zernio
 * endpoint 404s on plans/platforms that don't expose this data — when that
 * happens we simply don't render the card (`insights` comes back empty).
 * This keeps the analytics page clean for clients whose connections don't
 * support audience breakdowns.
 */
export function AudienceInsightsCard({ clientId }: AudienceInsightsCardProps) {
  const [insights, setInsights] = useState<Insight[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/reporting/audience-insights?clientId=${clientId}`)
      .then((res) => (res.ok ? res.json() : { insights: [] }))
      .then((data) => {
        if (!cancelled) setInsights(data.insights ?? []);
      })
      .catch(() => {
        if (!cancelled) setInsights([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [clientId]);

  if (loading) return null;
  if (!insights || insights.length === 0) return null;

  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Users2 size={16} className="text-text-muted" />
        <h2 className="text-sm font-semibold text-text-primary">Audience insights</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {insights.map((ins) => (
          <div key={`${ins.platform}-${ins.username}`} className="rounded-lg border border-nativz-border bg-background p-4 space-y-3">
            <div className="flex items-center gap-2">
              <PlatformBadge platform={ins.platform as SocialPlatform} size="sm" showLabel={false} />
              <span className="text-sm font-medium text-text-primary">@{ins.username}</span>
              {ins.followersTotal != null && (
                <span className="ml-auto text-xs text-text-muted tabular-nums">
                  {formatNum(ins.followersTotal)} followers
                </span>
              )}
            </div>
            <BucketList label="Top countries" buckets={ins.followersCountry} />
            <BucketList label="Top cities" buckets={ins.followersCity} />
            <BucketList label="Age" buckets={ins.followersAge} />
            <BucketList label="Gender" buckets={ins.followersGender} />
          </div>
        ))}
      </div>
    </div>
  );
}

function BucketList({ label, buckets }: { label: string; buckets: Bucket[] }) {
  if (!buckets || buckets.length === 0) return null;
  const top = buckets.slice(0, 4);
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-text-muted mb-1.5">{label}</p>
      <div className="space-y-1">
        {top.map((b) => (
          <div key={b.name} className="flex items-center gap-2 text-xs">
            <span className="text-text-secondary truncate flex-1">{b.name}</span>
            <div className="h-1.5 w-20 rounded-full bg-surface-hover overflow-hidden">
              <div
                className="h-full bg-accent"
                style={{ width: `${Math.min(100, Math.max(0, b.percent))}%` }}
              />
            </div>
            <span className="text-text-muted tabular-nums w-10 text-right">
              {b.percent.toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
