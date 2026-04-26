'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PlatformBadge } from './platform-badge';
import type { SocialPlatform } from '@/lib/types/reporting';

interface DemoRow { dimension: string; value: number }
interface InstagramDemo { age: DemoRow[]; country: DemoRow[]; city: DemoRow[]; gender: DemoRow[] }
interface YouTubeDemo { age: DemoRow[]; gender: DemoRow[]; country: DemoRow[] }

interface DemographicsCardProps {
  clientId: string;
  platform: 'instagram' | 'youtube';
}

function formatPct(v: number, total: number): string {
  if (total <= 0) return '0%';
  return `${((v / total) * 100).toFixed(1)}%`;
}

const GENDER_LABEL: Record<string, string> = {
  F: 'Female', M: 'Male', U: 'Unknown',
  female: 'Female', male: 'Male',
};

function sumValues(rows: DemoRow[]): number {
  return rows.reduce((s, r) => s + (r.value || 0), 0);
}

function sortedTop(rows: DemoRow[], n: number): DemoRow[] {
  return [...rows].sort((a, b) => b.value - a.value).slice(0, n);
}

function BarRow({ label, value, pct, color }: { label: string; value: number; pct: number; color: string }) {
  return (
    <div className="group">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-text-primary truncate">{label}</span>
        <span className="text-xs text-text-muted tabular-nums flex-shrink-0">
          {value.toLocaleString()} · {pct.toFixed(1)}%
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

export function DemographicsCard({ clientId, platform }: DemographicsCardProps) {
  const [data, setData] = useState<InstagramDemo | YouTubeDemo | null>(null);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadDemographics() {
      setLoading(true);
      try {
        const qs = new URLSearchParams({ clientId, platform });
        const r = await fetch(`/api/reporting/demographics?${qs}`);
        const d = await r.json();
        if (cancelled) return;
        setData(d.demographics ?? null);
        setReason(d.reason ?? null);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadDemographics();
    return () => {
      cancelled = true;
    };
  }, [clientId, platform]);

  const color = platform === 'instagram' ? '#e1306c' : '#ef4444';

  const sections = useMemo(() => {
    if (!data) return null;
    const age = sortedTop(data.age, 8);
    const country = sortedTop(data.country, 6);
    const gender = sortedTop(data.gender, 3);
    const city = platform === 'instagram' && 'city' in data ? sortedTop(data.city, 6) : [];
    const totalAge = sumValues(data.age);
    const totalCountry = sumValues(data.country);
    const totalGender = sumValues(data.gender);
    const totalCity = sumValues(platform === 'instagram' ? (data as InstagramDemo).city : []);
    return { age, country, gender, city, totalAge, totalCountry, totalGender, totalCity };
  }, [data, platform]);

  const label = platform === 'instagram' ? 'Instagram' : 'YouTube';

  if (loading) return <Skeleton className="h-80" />;

  if (!data || (sections && sections.totalAge === 0 && sections.totalCountry === 0)) {
    return (
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-2">
          <PlatformBadge platform={platform as SocialPlatform} showLabel={false} size="sm" />
          <h3 className="text-sm font-semibold text-text-primary">{label} audience</h3>
        </div>
        <p className="text-xs text-text-muted">
          {reason === 'not_connected'
            ? `No ${label} account connected to Zernio for this client.`
            : platform === 'instagram'
              ? 'Demographics require 100+ followers and a business / creator account.'
              : 'YouTube demographics not yet returned (requires analytics scope + 48h of data).'}
        </p>
      </Card>
    );
  }

  const { age, country, gender, city, totalAge, totalCountry, totalGender, totalCity } = sections!;

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <PlatformBadge platform={platform as SocialPlatform} showLabel={false} size="sm" />
        <h3 className="text-sm font-semibold text-text-primary">{label} audience</h3>
        <span className="text-xs text-text-muted ml-auto">{totalAge.toLocaleString()} followers</span>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {age.length > 0 && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-text-muted mb-2">Age</p>
            <div className="space-y-2">
              {age.map((r) => (
                <BarRow
                  key={r.dimension}
                  label={r.dimension}
                  value={r.value}
                  pct={totalAge > 0 ? (r.value / totalAge) * 100 : 0}
                  color={color}
                />
              ))}
            </div>
          </div>
        )}

        {gender.length > 0 && (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted mb-2">Gender</p>
            <div className="space-y-2">
              {gender.map((r) => (
                <BarRow
                  key={r.dimension}
                  label={GENDER_LABEL[r.dimension] ?? r.dimension}
                  value={r.value}
                  pct={totalGender > 0 ? (r.value / totalGender) * 100 : 0}
                  color={color}
                />
              ))}
            </div>
          </div>
        )}

        {country.length > 0 && (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted mb-2">Top countries</p>
            <div className="space-y-2">
              {country.map((r) => (
                <BarRow
                  key={r.dimension}
                  label={r.dimension}
                  value={r.value}
                  pct={totalCountry > 0 ? (r.value / totalCountry) * 100 : 0}
                  color={color}
                />
              ))}
            </div>
          </div>
        )}

        {city.length > 0 && (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted mb-2">Top cities</p>
            <div className="space-y-2">
              {city.map((r) => (
                <BarRow
                  key={r.dimension}
                  label={r.dimension}
                  value={r.value}
                  pct={totalCity > 0 ? (r.value / totalCity) * 100 : 0}
                  color={color}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* formatPct referenced to avoid "defined but unused" in case we wire labels later */}
      <span className="hidden">{formatPct(0, 0)}</span>
    </Card>
  );
}
