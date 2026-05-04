import { Film, AlertTriangle } from 'lucide-react';
import type { ServiceKind } from '@/lib/clients/service-defaults';
import { OverageReviewPill } from './overage-review-pill';

interface Props {
  used: number;
  capacity: number;
  source: 'proposal' | 'default' | 'not-subscribed';
  tierName?: string | null;
  periodStart: string;
  periodEnd: string;
  /** Required when payrollPeriodId is provided (to key the over-scope pill). */
  clientId?: string;
  /** Required when payrollPeriodId is provided (to key the over-scope pill). */
  service?: ServiceKind;
  /** Resolved payroll period for the over-scope review (null hides the pill). */
  payrollPeriodId?: string | null;
}

/**
 * Per-client editing progress strip. Shows X of Y editing slots used
 * this calendar month so editors and admins can see at a glance whether
 * a client is at, near, or past their contracted capacity before
 * uploading another final.
 *
 * Renders nothing when the client doesn't carry the editing service.
 * Renders an amber warning row when used >= capacity (and capacity > 0).
 */
export function DeliverableProgress({
  used,
  capacity,
  source,
  tierName,
  periodStart,
  periodEnd,
  clientId,
  service,
  payrollPeriodId,
}: Props) {
  if (source === 'not-subscribed') return null;

  const overOrAt = capacity > 0 && used >= capacity;
  const overCount = capacity > 0 && used > capacity ? used - capacity : 0;
  const ratio = capacity > 0 ? Math.min(1, used / capacity) : 0;
  const sourceLabel =
    source === 'proposal'
      ? tierName
        ? `Proposal (${tierName})`
        : 'Proposal'
      : 'Default';

  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-hover text-text-secondary">
            <Film size={14} />
          </div>
          <div>
            <p className="text-sm font-medium text-text-primary">
              Editing slots this period
            </p>
            <p className="text-[11px] text-text-muted">
              {periodStart} to {periodEnd} · {sourceLabel}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {clientId && service && (
            <OverageReviewPill
              clientId={clientId}
              service={service}
              periodId={payrollPeriodId ?? null}
              overCount={overCount}
            />
          )}
          <div className="flex items-baseline gap-1">
            <span className="font-mono text-lg text-text-primary tabular-nums">
              {used}
            </span>
            <span className="text-xs text-text-muted">/ {capacity}</span>
          </div>
        </div>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-hover">
        <div
          className={`h-full transition-all ${overOrAt ? 'bg-amber-400' : 'bg-emerald-400'}`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>

      {overOrAt && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            At or over the contracted editing capacity for this period. Any
            additional finals will flag as out-of-scope.
          </span>
        </div>
      )}
    </div>
  );
}
