'use client';

// SPY-06 T25: list of alert rows with empty state. Owns the ack handler
// so it can optimistically remove rows from the unack view.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ProspectMonitorAlertRow } from '@/lib/prospects/types';
import { AlertRow } from './alert-row';

interface Props {
  alerts: Array<
    ProspectMonitorAlertRow & {
      prospect?: { id: string; brand_name: string } | null;
    }
  >;
  prospectId?: string;
  showProspect?: boolean;
}

export function AlertFeed({ alerts, prospectId, showProspect }: Props) {
  const router = useRouter();
  const [acking, setAcking] = useState<Set<string>>(new Set());

  async function ack(alertId: string) {
    const targetProspectId =
      prospectId ?? alerts.find((a) => a.id === alertId)?.prospect_id;
    if (!targetProspectId) return;
    setAcking((s) => new Set(s).add(alertId));
    try {
      await fetch(
        `/api/prospects/${targetProspectId}/monitor/alerts/${alertId}/ack`,
        { method: 'POST' },
      );
      router.refresh();
    } finally {
      setAcking((s) => {
        const next = new Set(s);
        next.delete(alertId);
        return next;
      });
    }
  }

  if (alerts.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-surface px-3 py-6 text-center text-sm text-text-muted">
        No alerts yet. They'll show up once the weekly monitor finds something worth surfacing.
      </div>
    );
  }

  return (
    <ul className="space-y-1.5">
      {alerts.map((alert) => (
        <li key={alert.id} className={acking.has(alert.id) ? 'opacity-60' : undefined}>
          <AlertRow alert={alert} onAck={ack} showProspect={showProspect} />
        </li>
      ))}
    </ul>
  );
}
