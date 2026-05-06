'use client';

import { useEffect, useState } from 'react';
import { Film } from 'lucide-react';
import { DeliverableProgress } from './deliverable-progress';

/**
 * Fetcher wrapper for the editor's per-client editing-capacity strip on the
 * share-link review page. Owns the GET /api/clients/[id]/capacity
 * lifecycle so the underlying `<DeliverableProgress>` stays a dumb
 * presentational component (storybook-friendly, server-renderable when given
 * pre-fetched data).
 *
 * Renders a low-noise skeleton while loading, returns null on auth/network
 * failure (the upload form is the primary affordance, the strip is decorative
 * context, never a blocker), and hands the editing slice off to the strip
 * once we have data.
 *
 * Mount only when the viewer is an admin/editor uploading finals. Portal
 * viewers (clients) don't need to see internal capacity accounting.
 */
interface Props {
  clientId: string;
  /** Today only `editing` is wired; the API returns smm + blogging too. */
  service: 'editing' | 'smm' | 'blogging';
}

interface CapacitySlice {
  monthly: number;
  delivered: number;
  source: 'default' | 'not-subscribed';
}

interface CapacityResponse {
  periodStart: string;
  periodEnd: string;
  editing: CapacitySlice;
  smm: CapacitySlice;
  blogging: CapacitySlice;
  currentPayrollPeriodId: string | null;
}

export function EditingCapacityStrip({ clientId, service }: Props) {
  const [data, setData] = useState<CapacityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // try/finally guarantees the spinner always resolves: any unhandled throw
    // from fetch/json still falls through `finally`, so a failed network
    // request leaves the strip in error-hidden state instead of spinning
    // forever.
    async function load() {
      setLoading(true);
      setError(false);
      try {
        const res = await fetch(`/api/clients/${clientId}/capacity`, {
          credentials: 'include',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as CapacityResponse;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (loading) {
    return (
      <div
        aria-hidden
        className="rounded-xl border border-nativz-border bg-surface p-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-hover text-text-muted">
              <Film size={14} />
            </div>
            <div className="space-y-1.5">
              <div className="h-3 w-40 animate-pulse rounded bg-surface-hover" />
              <div className="h-2 w-28 animate-pulse rounded bg-surface-hover/70" />
            </div>
          </div>
          <div className="h-4 w-12 animate-pulse rounded bg-surface-hover" />
        </div>
        <div className="mt-3 h-1.5 w-full animate-pulse rounded-full bg-surface-hover" />
      </div>
    );
  }

  if (error || !data) return null;

  const slice = data[service];

  return (
    <DeliverableProgress
      clientId={clientId}
      service={service}
      payrollPeriodId={data.currentPayrollPeriodId}
      used={slice.delivered}
      capacity={slice.monthly}
      source={slice.source}
      periodStart={data.periodStart}
      periodEnd={data.periodEnd}
    />
  );
}
