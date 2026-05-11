'use client';

// ZNA-02: card composing header + chart + delta + range toggle for one
// platform. Refetches client-side on range change against the appropriate
// (admin vs portal) endpoint.

import { useEffect, useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { ZernioGrowthChart } from './zernio-growth-chart';
import { ZernioDeltaCallout } from './zernio-delta-callout';
import { ZernioRangeToggle } from './zernio-range-toggle';
import type {
  AnalyticsPlatform,
  DeltaResult,
  RangeKey,
  TimeseriesPoint,
  TimeseriesResult,
} from '@/lib/analytics/types';

interface Props {
  clientId: string;
  platform: AnalyticsPlatform;
  initial: TimeseriesResult;
  initialDelta: DeltaResult;
  initialRange: RangeKey;
  isPortal?: boolean;
}

const PLATFORM_LABEL: Record<AnalyticsPlatform, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
  youtube: 'YouTube',
};

export function ZernioPlatformCard({
  clientId,
  platform,
  initial,
  initialDelta,
  initialRange,
  isPortal,
}: Props) {
  const [points, setPoints] = useState<TimeseriesPoint[]>(initial.points);
  const [delta, setDelta] = useState<DeltaResult>(initialDelta);
  const [range, setRange] = useState<RangeKey>(initialRange);
  const [source, setSource] = useState(initial.source);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Keep URL in sync with active range, but only on the admin page; portal
  // page is single-brand and we don't want to thrash routing.
  useEffect(() => {
    if (typeof window === 'undefined' || isPortal) return;
    const u = new URL(window.location.href);
    u.searchParams.set('range', range);
    window.history.replaceState({}, '', u.toString());
  }, [range, isPortal]);

  function refetch(next: RangeKey) {
    setRange(next);
    setError(null);
    startTransition(async () => {
      try {
        const base = isPortal
          ? '/api/portal/analytics/zernio/timeseries'
          : '/api/analytics/zernio/timeseries';
        const params = new URLSearchParams({ platform, range: next });
        if (!isPortal) params.set('client_id', clientId);
        const res = await fetch(`${base}?${params.toString()}`);
        if (!res.ok) throw new Error(`status ${res.status}`);
        const body = (await res.json()) as {
          points: TimeseriesPoint[];
          delta: DeltaResult;
          source: typeof source;
        };
        setPoints(body.points);
        setDelta(body.delta);
        setSource(body.source);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'fetch failed');
      }
    });
  }

  const sparkline = points.map((p) => p.followers);
  const isEmpty = points.length === 0;

  return (
    <div className="rounded-2xl border border-white/5 bg-surface p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="text-sm font-medium">{PLATFORM_LABEL[platform]}</div>
          <div className="text-xs text-white/40 mt-0.5">
            {source === 'none' ? 'No data yet' : `Source: ${source}`}
          </div>
        </div>
        <ZernioDeltaCallout delta={delta} sparkline={sparkline} range={range} />
      </div>
      <div className="min-h-[240px]">
        {isEmpty ? (
          <div className="h-[240px] flex flex-col items-center justify-center text-center px-6">
            <div className="text-sm font-medium">No snapshots yet</div>
            <div className="text-xs text-white/50 mt-1">Connect Zernio to see growth charts.</div>
          </div>
        ) : (
          <div className="relative">
            <ZernioGrowthChart points={points} />
            {pending && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <Loader2 className="h-4 w-4 animate-spin text-white/60" />
              </div>
            )}
          </div>
        )}
      </div>
      <div className="mt-4 flex items-center justify-between">
        <ZernioRangeToggle value={range} onChange={refetch} />
        {error && <span className="text-xs text-red-400">Couldn&apos;t load. Refresh to retry.</span>}
      </div>
    </div>
  );
}
