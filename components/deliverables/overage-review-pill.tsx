'use client';

import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import type { ServiceKind } from '@/lib/clients/service-defaults';
import { OverageReviewDialog } from './overage-review-dialog';

interface Props {
  clientId: string;
  service: ServiceKind;
  /**
   * Resolved payroll_period_id this overage attaches to. The pill renders
   * nothing when null (no payroll period exists for "now" yet).
   */
  periodId: string | null;
  /** Number of deliverables past capacity. Pill renders nothing when 0 or less. */
  overCount: number;
  /** Optional: tighter inline style for the accounting period detail tab. */
  variant?: 'default' | 'compact';
}

/**
 * "X over scope" pill that opens the overage review dialog. Reused on
 * DeliverableProgress (editor upload), ServiceCapacityPanel (settings),
 * and the accounting period detail editing tab.
 */
export function OverageReviewPill({
  clientId,
  service,
  periodId,
  overCount,
  variant = 'default',
}: Props) {
  const [open, setOpen] = useState(false);
  if (overCount <= 0 || !periodId) return null;

  const compact = variant === 'compact';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          compact
            ? 'inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-200 hover:bg-amber-500/20'
            : 'inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-200 hover:bg-amber-500/20'
        }
        title="Open the out-of-scope review dialog"
      >
        <AlertCircle size={compact ? 10 : 12} />
        {overCount} over scope
      </button>
      {open && (
        <OverageReviewDialog
          open={open}
          onClose={() => setOpen(false)}
          clientId={clientId}
          service={service}
          periodId={periodId}
        />
      )}
    </>
  );
}
