'use client';

import { useEffect, useState } from 'react';
import { Film, Loader2 } from 'lucide-react';
import type { ClientServiceCapacity } from '@/lib/clients/get-service-capacity';

interface Props {
  clientId: string;
}

/**
 * Small inline chip for the drop detail header. Shows how many editing
 * deliverables the client has consumed this calendar month against their
 * monthly entitlement. Drop detail is editing-only today, so we only
 * surface the editing service.
 */
export function DeliverableProgressChip({ clientId }: Props) {
  const [data, setData] = useState<ClientServiceCapacity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/clients/${clientId}/capacity`);
        if (!res.ok) return;
        const json = (await res.json()) as ClientServiceCapacity;
        if (!cancelled) setData(json);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (loading) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-nativz-border bg-surface-hover px-2 py-1 text-[11px] text-text-muted">
        <Loader2 size={11} className="animate-spin" />
        Capacity
      </span>
    );
  }

  if (!data) return null;

  const editing = data.editing;
  if (editing.source === 'not-subscribed') return null;

  const remaining = Math.max(0, editing.monthly - editing.delivered);
  const overBudget = editing.delivered > editing.monthly;
  const tone = overBudget
    ? 'border-red-500/30 bg-red-500/10 text-red-300'
    : remaining === 0
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
      : 'border-nativz-border bg-surface-hover text-text-secondary';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] tabular-nums ${tone}`}
      title={`${editing.delivered} of ${editing.monthly} editing deliverables used this period (${data.periodStart} to ${data.periodEnd})`}
    >
      <Film size={11} />
      <span className="font-medium">
        {editing.delivered} / {editing.monthly}
      </span>
      <span className="text-text-muted">edits</span>
    </span>
  );
}
