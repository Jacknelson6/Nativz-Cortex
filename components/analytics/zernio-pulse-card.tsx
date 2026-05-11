'use client';

// ZNA-03: top-of-page pulse card. Admin gets actions toolbar (Lock /
// Regenerate / Flag wrong / Dismiss); portal gets read-only.
// Returns null when pulse is null to avoid an empty-state row.

import { useState, useTransition } from 'react';
import { Sparkles, Lock, RefreshCw, AlertTriangle, X, Loader2 } from 'lucide-react';

export interface PulseShape {
  id: string;
  client_id: string;
  pulse_date: string;
  generated_at: string;
  body: string;
  signal_metric: 'followers' | 'views_rolling_7d' | 'engagements_rolling_7d' | 'trend_reversal' | 'cross_platform';
  signal_value: number | null;
  platforms_referenced: string[];
  referenced_post_ids: string[];
  is_dismissed: boolean;
  is_locked: boolean;
  flagged_wrong_at?: string | null;
}

interface Props {
  pulse: PulseShape | null;
  isPortal?: boolean;
  onDismiss?: () => Promise<void>;
  onRegenerate?: () => Promise<void>;
  onToggleLock?: (locked: boolean) => Promise<void>;
  onFlagWrong?: (reason?: string) => Promise<void>;
}

const SIGNAL_LABEL: Record<PulseShape['signal_metric'], string> = {
  followers: 'Followers',
  views_rolling_7d: 'Views (7d avg)',
  engagements_rolling_7d: 'Engagements (7d avg)',
  trend_reversal: 'Trend reversal',
  cross_platform: 'Cross-platform',
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ZernioPulseCard({
  pulse,
  isPortal,
  onDismiss,
  onRegenerate,
  onToggleLock,
  onFlagWrong,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!pulse) return null;

  function run(action: string, fn?: () => Promise<void>) {
    if (!fn) return;
    setError(null);
    setPendingAction(action);
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Action failed');
      } finally {
        setPendingAction(null);
      }
    });
  }

  const borderClass = pulse.flagged_wrong_at
    ? 'border-red-500/30'
    : pulse.is_locked
      ? 'border-amber-500/30'
      : 'border-white/5';

  const captionParts: string[] = [];
  captionParts.push(relativeTime(pulse.generated_at));
  captionParts.push(SIGNAL_LABEL[pulse.signal_metric]);
  if (pulse.signal_value !== null && pulse.signal_metric !== 'trend_reversal' && pulse.signal_metric !== 'cross_platform') {
    const sign = pulse.signal_value >= 0 ? '+' : '';
    captionParts.push(`${sign}${pulse.signal_value.toFixed(1)}%`);
  }
  if (pulse.is_locked) captionParts.push('Locked, auto-unlocks at UTC midnight');
  if (pulse.flagged_wrong_at) captionParts.push(`Flagged ${relativeTime(pulse.flagged_wrong_at)}`);

  return (
    <div className={`rounded-2xl border ${borderClass} bg-surface p-5`}>
      <div className="flex items-start gap-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent-text">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-relaxed text-white/90">{pulse.body}</p>
          <p className="mt-2 text-xs text-white/40">{captionParts.join(' · ')}</p>
        </div>
        {!isPortal && (
          <div role="toolbar" className="flex shrink-0 items-center gap-1">
            {onToggleLock && (
              <button
                type="button"
                onClick={() => run('lock', () => onToggleLock(!pulse.is_locked))}
                disabled={pending}
                aria-label={pulse.is_locked ? 'Unlock pulse' : 'Lock pulse'}
                title={pulse.is_locked ? 'Unlock pulse' : 'Lock pulse'}
                className="rounded-md p-1.5 text-white/60 hover:bg-white/5 hover:text-white disabled:opacity-50"
              >
                {pendingAction === 'lock' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              </button>
            )}
            {onRegenerate && (
              <button
                type="button"
                onClick={() => run('regen', onRegenerate)}
                disabled={pending}
                aria-label="Regenerate pulse"
                title="Regenerate"
                className="rounded-md p-1.5 text-white/60 hover:bg-white/5 hover:text-white disabled:opacity-50"
              >
                {pendingAction === 'regen' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </button>
            )}
            {onFlagWrong && (
              <button
                type="button"
                onClick={() => run('flag', () => onFlagWrong(undefined))}
                disabled={pending}
                aria-label="Flag as wrong"
                title="Flag as wrong"
                className="rounded-md p-1.5 text-white/60 hover:bg-white/5 hover:text-white disabled:opacity-50"
              >
                {pendingAction === 'flag' ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
              </button>
            )}
            {onDismiss && (
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== 'undefined' && !window.confirm("Hide today's pulse?")) return;
                  run('dismiss', onDismiss);
                }}
                disabled={pending}
                aria-label="Dismiss pulse"
                title="Dismiss"
                className="rounded-md p-1.5 text-white/60 hover:bg-white/5 hover:text-white disabled:opacity-50"
              >
                {pendingAction === 'dismiss' ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              </button>
            )}
          </div>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
