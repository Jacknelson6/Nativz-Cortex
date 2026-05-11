// SPY-08 T12: server component that wraps any analytics surface with the
// resolver + data-source pill. Charts stay where they are; this just adds
// the header strip so every analytics card answers "where did this data
// come from?" without each chart having to ask itself.

import type { ReactNode } from 'react';
import { resolveAnalyticsSource } from '@/lib/analytics/range/source-router';
import { DataSourcePill } from '@/components/analytics/data-source-pill';
import type {
  AnalyticsRange,
  RangePlatform,
} from '@/lib/analytics/range/types';

interface AnalyticsCardShellProps {
  title: string;
  clientId: string;
  platform: RangePlatform;
  range: AnalyticsRange;
  /** Optional explainer rendered under the title. */
  description?: string;
  children: ReactNode;
}

export async function AnalyticsCardShell({
  title,
  clientId,
  platform,
  range,
  description,
  children,
}: AnalyticsCardShellProps) {
  const resolution = await resolveAnalyticsSource({ clientId, platform, range });
  return (
    <section className="overflow-hidden rounded-xl border border-nativz-border bg-surface text-text-primary shadow-[var(--shadow-card)]">
      <header className="flex items-start justify-between gap-3 border-b border-nativz-border/60 px-5 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          {description ? (
            <p className="mt-0.5 text-xs text-text-muted leading-relaxed">{description}</p>
          ) : null}
        </div>
        <DataSourcePill
          source={resolution.source}
          stale={resolution.staleZernio}
          connectedAt={resolution.connectedAt}
        />
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}
