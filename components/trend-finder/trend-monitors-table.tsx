'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pause, Play, Trash2, Zap } from 'lucide-react';

type ClientEmbed = { name: string; agency: string | null } | { name: string; agency: string | null }[] | null;

interface Subscription {
  id: string;
  client_id: string | null;
  name: string;
  topic_query: string;
  keywords: string[];
  brand_names: string[];
  cadence: string;
  recipients: string[];
  include_portal_users: boolean;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string;
  client: ClientEmbed;
}

function resolveClient(c: ClientEmbed): { name: string } | null {
  if (!c) return null;
  if (Array.isArray(c)) return c[0] ?? null;
  return c;
}

function formatAge(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 0) {
    const ahead = Math.floor(-diff / 60000);
    if (ahead < 60) return `in ${ahead}m`;
    const h = Math.floor(ahead / 60);
    if (h < 24) return `in ${h}h`;
    return `in ${Math.floor(h / 24)}d`;
  }
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function TrendMonitorsTable({ subscriptions }: { subscriptions: Subscription[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function runNow(id: string) {
    setPendingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/trend-reports/subscriptions/${id}/run-now`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error ?? 'Run failed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Run failed');
    } finally {
      setPendingId(null);
      startTransition(() => router.refresh());
    }
  }

  async function togglePause(id: string, enabled: boolean) {
    setPendingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/trend-reports/subscriptions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !enabled }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Update failed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setPendingId(null);
      startTransition(() => router.refresh());
    }
  }

  async function del(id: string) {
    if (!confirm('Delete this monitor? Report history will also be deleted.')) return;
    setPendingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/trend-reports/subscriptions/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Delete failed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setPendingId(null);
      startTransition(() => router.refresh());
    }
  }

  if (subscriptions.length === 0) {
    return (
      <div className="rounded-xl border border-nativz-border bg-surface p-8 text-center text-sm text-text-muted">
        No monitors yet. Click <span className="text-cyan-300">+ New monitor</span> to set up the
        first one.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
      {error && (
        <div className="border-b border-coral-500/30 bg-coral-500/10 px-4 py-2 text-xs text-coral-300">
          {error}
        </div>
      )}
      {subscriptions.map((s) => {
        const client = resolveClient(s.client);
        const isPending = pendingId === s.id;
        return (
          <div
            key={s.id}
            className="grid grid-cols-[1.4fr_1fr_auto_auto] items-center gap-4 border-b border-nativz-border/60 px-4 py-3 text-sm last:border-b-0 hover:bg-surface-hover/30"
          >
            <div>
              <div
                className="truncate text-text-primary"
                style={{ fontFamily: 'var(--font-nz-display), system-ui, sans-serif', fontWeight: 600 }}
              >
                {s.name}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-text-muted">
                {client?.name ?? 'No client'} · `{s.topic_query}`
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {s.brand_names.slice(0, 3).map((b) => (
                  <span
                    key={`brand-${b}`}
                    className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] text-cyan-300"
                  >
                    {b}
                  </span>
                ))}
                {s.keywords.slice(0, 3).map((k) => (
                  <span
                    key={`kw-${k}`}
                    className="rounded-full border border-text-muted/30 bg-surface-hover/60 px-1.5 py-0.5 text-[10px] text-text-secondary"
                  >
                    {k}
                  </span>
                ))}
                {s.brand_names.length + s.keywords.length > 6 && (
                  <span className="text-[10px] text-text-muted/70">
                    +{s.brand_names.length + s.keywords.length - 6} more
                  </span>
                )}
              </div>
            </div>
            <div className="text-right text-xs tabular-nums text-text-muted">
              <div>Next: {formatAge(s.next_run_at)}</div>
              <div className="text-[10px] opacity-70">Last: {formatAge(s.last_run_at)}</div>
            </div>
            <span className="shrink-0 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-cyan-300">
              {s.cadence}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                title="Run now"
                disabled={isPending}
                onClick={() => runNow(s.id)}
                className="inline-flex items-center gap-1 rounded-md border border-nativz-border/60 bg-surface-hover/30 px-2 py-1 text-[11px] text-text-secondary transition-colors hover:border-cyan-500/30 hover:text-cyan-300 disabled:opacity-40"
              >
                <Zap size={13} /> Run
              </button>
              <button
                type="button"
                title={s.enabled ? 'Pause' : 'Resume'}
                disabled={isPending}
                onClick={() => togglePause(s.id, s.enabled)}
                className="inline-flex items-center gap-1 rounded-md border border-nativz-border/60 bg-surface-hover/30 px-2 py-1 text-[11px] text-text-secondary transition-colors hover:border-cyan-500/30 hover:text-cyan-300 disabled:opacity-40"
              >
                {s.enabled ? <Pause size={13} /> : <Play size={13} />}
                {s.enabled ? 'Pause' : 'Resume'}
              </button>
              <button
                type="button"
                title="Delete"
                disabled={isPending}
                onClick={() => del(s.id)}
                className="inline-flex items-center gap-1 rounded-md border border-coral-500/30 bg-coral-500/10 px-2 py-1 text-[11px] text-coral-300 transition-colors hover:bg-coral-500/20 disabled:opacity-40"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
