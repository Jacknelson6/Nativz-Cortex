'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Eye, Phone, Navigation, Globe } from 'lucide-react';
import { GoogleBusinessMark } from '@/components/integrations/google-business-mark';

interface Keyword { keyword: string; count: number }
interface GmbResponse {
  connected: boolean;
  performance?: Record<string, unknown> | null;
  keywords?: Keyword[];
}

interface GoogleBusinessCardProps {
  clientId: string;
  start: string;
  end: string;
}

function pickNum(obj: Record<string, unknown> | null | undefined, ...keys: string[]): number {
  if (!obj) return 0;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'number') return v;
  }
  return 0;
}

function formatNumber(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

export function GoogleBusinessCard({ clientId, start, end }: GoogleBusinessCardProps) {
  const [data, setData] = useState<GmbResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadGmb() {
      setLoading(true);
      try {
        const qs = new URLSearchParams({ clientId, start, end });
        const r = await fetch(`/api/reporting/gmb?${qs}`);
        const d = await r.json();
        if (!cancelled) setData(d);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadGmb();
    return () => {
      cancelled = true;
    };
  }, [clientId, start, end]);

  if (loading) return <Skeleton className="h-48" />;
  if (!data) return null;

  if (!data.connected) {
    return (
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-2">
          <GoogleBusinessMark size={18} />
          <h3 className="ui-card-title">Google Business Profile</h3>
        </div>
        <p className="text-sm text-text-muted">
          No Google Business Profile connected to Zernio for this client yet.
          Connect one in Zernio to see map views, website clicks, call buttons,
          direction requests, and the search keywords driving the listing.
        </p>
      </Card>
    );
  }

  const perf = data.performance ?? {};
  // Zernio's GMB performance response shape varies; we defensively probe
  // common Google Business Profile metric names.
  const mapViews = pickNum(perf, 'mapViews', 'BUSINESS_IMPRESSIONS_DESKTOP_MAPS', 'views_maps');
  const searchViews = pickNum(perf, 'searchViews', 'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH', 'views_search');
  const websiteClicks = pickNum(perf, 'websiteClicks', 'WEBSITE_CLICKS', 'website_clicks');
  const callClicks = pickNum(perf, 'callClicks', 'CALL_CLICKS', 'phone_calls');
  const directionRequests = pickNum(perf, 'directionRequests', 'BUSINESS_DIRECTION_REQUESTS', 'direction_requests');

  const stats: Array<{ icon: ReactNode; label: string; value: number }> = [
    { icon: <Eye size={14} />, label: 'Map views', value: mapViews },
    { icon: <Search size={14} />, label: 'Search views', value: searchViews },
    { icon: <Globe size={14} />, label: 'Website clicks', value: websiteClicks },
    { icon: <Phone size={14} />, label: 'Calls', value: callClicks },
    { icon: <Navigation size={14} />, label: 'Directions', value: directionRequests },
  ].filter((s) => s.value > 0);

  const keywords = (data.keywords ?? []).slice(0, 10);

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-[#4285F4] text-white text-[10px] font-bold">G</span>
        <h3 className="ui-card-title">Google Business Profile</h3>
      </div>

      {stats.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border border-nativz-border/50 bg-surface p-3">
              <div className="flex items-center gap-1.5 text-xs text-text-muted">
                {s.icon}
                {s.label}
              </div>
              <p className="mt-1 text-xl font-semibold tracking-tight text-text-primary tabular-nums font-display">
                {formatNumber(s.value)}
              </p>
            </div>
          ))}
        </div>
      )}

      {keywords.length > 0 && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-text-muted mb-2">
            Top search keywords
          </p>
          <div className="flex flex-wrap gap-1.5">
            {keywords.map((k) => (
              <span
                key={k.keyword}
                className="inline-flex items-center gap-1 rounded-full bg-[#4285F4]/10 border border-[#4285F4]/30 text-[#4285F4] px-2.5 py-1 text-xs"
              >
                {k.keyword}
                <span className="text-text-muted">·</span>
                <span className="tabular-nums text-text-muted">{k.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {stats.length === 0 && keywords.length === 0 && (
        <p className="text-xs text-text-muted">
          Connected, but Zernio returned no performance data for this window yet.
        </p>
      )}
    </Card>
  );
}
