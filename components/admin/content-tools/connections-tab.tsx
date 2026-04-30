'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  CheckCircle2,
  AlertTriangle,
  Cable,
  RefreshCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Connections tab. Cross-checks every external integration the
 * content pipeline relies on. The shape is stable -- per-integration
 * cards laid out in a 2-column grid with a status dot, last-checked
 * timestamp where applicable, and a one-line "what it does" subtitle
 * so a non-engineer admin can read the row.
 *
 * Iter 14.1 ships the layout backed by env-var presence checks (cheap
 * and accurate for a "is the secret even here" sanity probe). Iter
 * 14.2 layers in real reachability probes (Monday board ping, Resend
 * domain check, Supabase round-trip, Drive token refresh, etc.).
 */

export type ConnectionStatus = 'connected' | 'missing' | 'unknown';

export interface ConnectionRow {
  id: string;
  label: string;
  description: string;
  status: ConnectionStatus;
  lastCheckedAt?: string | null;
  detail?: string | null;
}

export function ConnectionsTab() {
  const [rows, setRows] = useState<ConnectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load(silent = false) {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch('/api/admin/content-tools/connections', {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Failed to load connections');
      const data = (await res.json()) as { rows: ConnectionRow[] };
      setRows(data.rows ?? []);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to load connections',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const connected = rows.filter((r) => r.status === 'connected').length;

  return (
    <div className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-nativz-border px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-accent-text/10 text-accent-text">
            <Cable className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-text-primary">
              Connections
            </div>
            <div className="mt-0.5 text-xs text-text-muted">
              {loading
                ? 'Checking integrations...'
                : `${connected} of ${rows.length} connected`}
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void load(true)}
          disabled={refreshing || loading}
          aria-label="Re-check connections"
        >
          <RefreshCcw
            size={14}
            className={refreshing ? 'animate-spin' : ''}
          />
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-3 p-5 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-lg border border-nativz-border/60 bg-background/40"
            />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-text-muted">
          No integrations registered.
        </div>
      ) : (
        <div className="grid gap-3 p-5 sm:grid-cols-2">
          {rows.map((row) => (
            <ConnectionCard key={row.id} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

function ConnectionCard({ row }: { row: ConnectionRow }) {
  const tone =
    row.status === 'connected'
      ? {
          dot: 'bg-status-success',
          chip: 'border-status-success/30 bg-status-success/10 text-status-success',
          label: 'Connected',
          icon: CheckCircle2,
        }
      : row.status === 'missing'
        ? {
            dot: 'bg-status-danger',
            chip: 'border-status-danger/30 bg-status-danger/10 text-status-danger',
            label: 'Missing',
            icon: AlertTriangle,
          }
        : {
            dot: 'bg-text-tertiary',
            chip: 'border-nativz-border bg-background text-text-muted',
            label: 'Unknown',
            icon: AlertTriangle,
          };
  const Icon = tone.icon;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-nativz-border/70 bg-background/40 p-3">
      <span
        className={`mt-1 size-2 shrink-0 rounded-full ${tone.dot}`}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="truncate text-sm font-medium text-text-primary">
            {row.label}
          </div>
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone.chip}`}
          >
            <Icon className="size-3" />
            {tone.label}
          </span>
        </div>
        <div className="mt-0.5 text-xs text-text-muted">{row.description}</div>
        {row.detail && (
          <div className="mt-1 text-[11px] text-text-tertiary">{row.detail}</div>
        )}
      </div>
    </div>
  );
}
