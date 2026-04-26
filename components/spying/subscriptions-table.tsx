'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pause, Play, Trash2, Zap } from 'lucide-react';

type ClientEmbed = { name: string; agency: string | null } | { name: string; agency: string | null }[] | null;

interface Subscription {
  id: string;
  client_id: string;
  cadence: string;
  recipients: string[];
  include_portal_users: boolean;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string;
  client: ClientEmbed;
}

function resolveClient(client: ClientEmbed): { name: string; agency: string | null } | null {
  if (!client) return null;
  if (Array.isArray(client)) return client[0] ?? null;
  return client;
}

function formatAge(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 0) {
    const ahead = Math.floor(-diff / 60000);
    if (ahead < 60) return `in ${ahead}m`;
    const hAhead = Math.floor(ahead / 60);
    if (hAhead < 24) return `in ${hAhead}h`;
    return `in ${Math.floor(hAhead / 24)}d`;
  }
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function SubscriptionsTable({ subscriptions }: { subscriptions: Subscription[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function runNow(id: string) {
    setPendingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/competitor-reports/subscriptions/${id}/run-now`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error ?? 'Run failed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Run failed');
    } finally {
      setPendingId(null);
      startTransition(() => router.refresh());
    }
  }

  async function togglePause(id: string, currentlyEnabled: boolean) {
    setPendingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/competitor-reports/subscriptions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !currentlyEnabled }),
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
    if (!confirm('Delete this subscription? History rows will also be deleted.')) return;
    setPendingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/competitor-reports/subscriptions/${id}`, { method: 'DELETE' });
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
        No subscriptions yet. Click <span className="text-accent-text">+ New subscription</span> to
        schedule the first one.
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
      <div className="grid grid-cols-[1.2fr_auto_auto_1fr_auto_auto] items-center gap-4 border-b border-nativz-border/60 bg-surface-hover/30 px-4 py-2 text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">
        <span>Client</span>
        <span>Cadence</span>
        <span className="text-right">Next run</span>
        <span>Recipients</span>
        <span className="text-right">Status</span>
        <span className="text-right">Actions</span>
      </div>
      {subscriptions.map((s) => {
        const client = resolveClient(s.client);
        const isPending = pendingId === s.id;
        return (
          <div
            key={s.id}
            className="grid grid-cols-[1.2fr_auto_auto_1fr_auto_auto] items-center gap-4 border-b border-nativz-border/60 px-4 py-3 text-sm last:border-b-0 hover:bg-surface-hover/30"
          >
            <div>
              <div className="truncate text-text-primary">{client?.name ?? '(client deleted)'}</div>
              <div className="truncate font-mono text-[10px] text-text-muted">{s.client_id.slice(0, 8)}</div>
            </div>
            <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent-text">
              {s.cadence}
            </span>
            <span className="text-right text-xs tabular-nums text-text-muted">
              {formatAge(s.next_run_at)}
            </span>
            <div className="min-w-0 text-xs text-text-muted">
              <div className="truncate">{s.recipients.slice(0, 2).join(', ')}</div>
              {s.recipients.length > 2 && (
                <div className="text-[10px] text-text-muted/70">+{s.recipients.length - 2} more</div>
              )}
              {s.include_portal_users && (
                <div className="text-[10px] text-accent-text/70">+ portal users</div>
              )}
            </div>
            <span className="text-right">
              <span
                className={
                  'rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ' +
                  (s.enabled
                    ? 'border border-accent/30 bg-accent/10 text-accent-text'
                    : 'border border-text-muted/30 bg-surface-hover/60 text-text-secondary')
                }
              >
                {s.enabled ? 'Active' : 'Paused'}
              </span>
            </span>
            <div className="flex items-center justify-end gap-1.5">
              <ActionButton
                label="Run now"
                title="Generate + email right now"
                disabled={isPending}
                onClick={() => runNow(s.id)}
                icon={<Zap size={13} />}
              />
              <ActionButton
                label={s.enabled ? 'Pause' : 'Resume'}
                title={s.enabled ? 'Pause this subscription' : 'Resume this subscription'}
                disabled={isPending}
                onClick={() => togglePause(s.id, s.enabled)}
                icon={s.enabled ? <Pause size={13} /> : <Play size={13} />}
              />
              <ActionButton
                label="Delete"
                title="Delete subscription + history"
                disabled={isPending}
                onClick={() => del(s.id)}
                icon={<Trash2 size={13} />}
                variant="danger"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ActionButton({
  label,
  title,
  disabled,
  onClick,
  icon,
  variant,
}: {
  label: string;
  title: string;
  disabled: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  variant?: 'danger';
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors disabled:opacity-40 ' +
        (variant === 'danger'
          ? 'border-coral-500/30 bg-coral-500/10 text-coral-300 hover:bg-coral-500/20'
          : 'border-nativz-border/60 bg-surface-hover/30 text-text-secondary hover:border-accent/30 hover:text-accent-text')
      }
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
