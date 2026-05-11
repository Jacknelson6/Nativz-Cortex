// SPY-06 T24: a single alert row. Server-renderable when there's no
// ack handler; pass `onAck` for the interactive variant. Used by both
// the prospect detail feed and the global feed.

'use client';

import { Activity, Check, Flame, Shuffle, TrendingUp } from 'lucide-react';
import type { AlertKind, AlertSeverity, ProspectMonitorAlertRow } from '@/lib/prospects/types';
import { ALERT_KIND_LABELS } from '@/lib/prospects/delta-rules';

interface Props {
  alert: ProspectMonitorAlertRow & {
    prospect?: { id: string; brand_name: string } | null;
  };
  onAck?: (alertId: string) => Promise<void> | void;
  showProspect?: boolean;
}

const KIND_ICON: Record<AlertKind, React.ComponentType<{ size?: number; className?: string }>> = {
  follower_jump: TrendingUp,
  viral_post: Flame,
  cadence_shift: Activity,
  format_pivot: Shuffle,
};

const SEVERITY_CLASSES: Record<AlertSeverity, string> = {
  high: 'border-red-500/30 bg-red-500/5 text-red-500',
  medium: 'border-amber-500/30 bg-amber-500/5 text-amber-500',
  low: 'border-border bg-surface text-text-muted',
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function AlertRow({ alert, onAck, showProspect }: Props) {
  const Icon = KIND_ICON[alert.kind];
  const acked = Boolean(alert.acknowledged_at);

  return (
    <div className="flex items-start gap-3 rounded-md border border-border bg-surface px-3 py-2.5">
      <div className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${SEVERITY_CLASSES[alert.severity]}`}>
        <Icon size={14} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span className="font-medium text-foreground">{ALERT_KIND_LABELS[alert.kind]}</span>
          <span>·</span>
          <span>{alert.severity}</span>
          <span>·</span>
          <span>{timeAgo(alert.occurred_at)}</span>
          {showProspect && alert.prospect && (
            <>
              <span>·</span>
              <span className="truncate">{alert.prospect.brand_name}</span>
            </>
          )}
        </div>
        <div className="mt-0.5 text-sm text-foreground">{alert.message}</div>
      </div>
      {onAck && !acked && (
        <button
          type="button"
          onClick={() => onAck(alert.id)}
          className="inline-flex shrink-0 items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs text-text-muted hover:text-foreground"
        >
          <Check size={12} />
          Ack
        </button>
      )}
      {acked && (
        <span className="inline-flex shrink-0 items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/5 px-2 py-1 text-xs text-emerald-500">
          <Check size={12} />
          Acked
        </span>
      )}
    </div>
  );
}
