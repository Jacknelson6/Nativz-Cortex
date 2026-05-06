'use client';

import { useEffect, useState } from 'react';
import { Loader2, Gauge, FileText, Film, Megaphone } from 'lucide-react';
import { IconCard } from '@/components/ui/icon-card';
import { OverageReviewPill } from '@/components/deliverables/overage-review-pill';
import type { ClientServiceCapacity, ServiceCapacity } from '@/lib/clients/get-service-capacity';
import type { ServiceKind } from '@/lib/clients/service-defaults';

interface CapacityResponse extends ClientServiceCapacity {
  currentPayrollPeriodId: string | null;
}

const SERVICE_META: Record<ServiceKind, { label: string; icon: typeof Film }> = {
  editing: { label: 'Editing', icon: Film },
  smm: { label: 'Social media management', icon: Megaphone },
  blogging: { label: 'Blogging', icon: FileText },
};

function sourceLabel(source: ServiceCapacity['source']): string {
  switch (source) {
    case 'default':
      return 'Default';
    case 'not-subscribed':
      return 'Not subscribed';
  }
}

function sourceTone(source: ServiceCapacity['source']): string {
  switch (source) {
    case 'default':
      return 'bg-amber-500/10 text-amber-300 border-amber-500/30';
    case 'not-subscribed':
      return 'bg-surface-hover text-text-muted border-nativz-border';
  }
}

interface Props {
  clientId: string;
}

export function ServiceCapacityPanel({ clientId }: Props) {
  const [data, setData] = useState<CapacityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/clients/${clientId}/capacity`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? `Request failed (${res.status})`);
        }
        const json = (await res.json()) as CapacityResponse;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  return (
    <IconCard
      icon={<Gauge size={16} />}
      title="Service capacity"
      helpText="Monthly deliverables this client is entitled to per service. Numbers come from a default fallback per service. Used by the editor upload page and the auto-populate engine."
    >
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <Loader2 size={14} className="animate-spin" />
          Loading capacity…
        </div>
      ) : error ? (
        <p className="text-xs text-red-400">{error}</p>
      ) : !data ? (
        <p className="text-xs text-text-muted">No data.</p>
      ) : (
        <div className="space-y-2">
          {(['editing', 'smm', 'blogging'] as ServiceKind[]).map((kind) => {
            const cap = data[kind];
            const meta = SERVICE_META[kind];
            const Icon = meta.icon;
            const overCount =
              cap.monthly > 0 && cap.delivered > cap.monthly ? cap.delivered - cap.monthly : 0;
            return (
              <div
                key={kind}
                className="flex items-center justify-between rounded-lg border border-nativz-border bg-background/40 px-3 py-2.5"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-surface-hover text-text-secondary">
                    <Icon size={14} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text-primary">{meta.label}</p>
                    <p className="text-[11px] text-text-muted">
                      Period: {data.periodStart} to {data.periodEnd}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <OverageReviewPill
                    clientId={clientId}
                    service={kind}
                    periodId={data.currentPayrollPeriodId}
                    overCount={overCount}
                    variant="compact"
                  />
                  <span
                    className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${sourceTone(cap.source)}`}
                  >
                    {sourceLabel(cap.source)}
                  </span>
                  <span className="font-mono text-base text-text-primary tabular-nums">
                    {cap.delivered} / {cap.monthly}
                  </span>
                  <span className="text-[11px] text-text-muted">this period</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </IconCard>
  );
}
