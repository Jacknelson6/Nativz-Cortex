'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, AlertCircle, Info, Check, RefreshCcw, XCircle } from 'lucide-react';

type Anomaly = {
  id: string;
  detector: string;
  severity: 'info' | 'warning' | 'error';
  entity_type: string | null;
  entity_id: string | null;
  client_id: string | null;
  title: string;
  description: string | null;
  metadata: Record<string, unknown>;
  first_detected_at: string;
  last_detected_at: string;
  resolved_at: string | null;
  dismissed_at: string | null;
  clients: { name: string | null; slug: string | null } | null;
};

const SEVERITY_ICON = {
  error: <AlertCircle size={14} className="text-coral-300" />,
  warning: <AlertTriangle size={14} className="text-amber-300" />,
  info: <Info size={14} className="text-nz-cyan" />,
};

export function AnomaliesTab() {
  const [items, setItems] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<'open' | 'resolved' | 'dismissed'>('open');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/revenue/anomalies?scope=${scope}`);
      const json = await res.json();
      setItems(json.anomalies ?? []);
    } catch (err) {
      console.error('[anomalies-tab] load failed', err);
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    void load();
  }, [load]);

  async function dismiss(id: string) {
    const reason = prompt('Why are you dismissing this? (optional)');
    if (reason === null) return;
    setBusyId(id);
    try {
      const res = await fetch('/api/revenue/anomalies', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, reason }),
      });
      if (!res.ok) {
        alert('Dismiss failed');
        return;
      }
      await load();
    } catch (err) {
      alert(`Dismiss failed: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setBusyId(null);
    }
  }

  const counts = items.reduce(
    (acc, a) => {
      acc[a.severity] += 1;
      return acc;
    },
    { error: 0, warning: 0, info: 0 },
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-xs text-text-muted">
          {scope === 'open' ? (
            <>
              <span className="inline-flex items-center gap-1">
                <AlertCircle size={12} className="text-coral-300" /> {counts.error} error
              </span>
              <span className="inline-flex items-center gap-1">
                <AlertTriangle size={12} className="text-amber-300" /> {counts.warning} warning
              </span>
              <span className="inline-flex items-center gap-1">
                <Info size={12} className="text-nz-cyan" /> {counts.info} info
              </span>
            </>
          ) : (
            <span>{items.length} items</span>
          )}
        </div>
        <div className="flex items-center gap-1 rounded-full border border-nativz-border bg-surface p-0.5 text-[11px]">
          {(['open', 'resolved', 'dismissed'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={`rounded-full px-3 py-1 ${
                scope === s ? 'bg-white/10 text-text-primary' : 'text-text-muted hover:text-text-primary'
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => load()}
            className="ml-1 rounded-full p-1 text-text-muted hover:text-text-primary"
            title="Refresh"
          >
            <RefreshCcw size={11} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-nativz-border bg-surface p-6 text-sm text-text-muted">
          Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-6 text-sm text-emerald-200">
          <Check size={16} className="mb-2" />
          No {scope} anomalies. All detectors ran clean.
        </div>
      ) : (
        <div className="divide-y divide-white/5 rounded-xl border border-nativz-border bg-surface">
          {items.map((a) => (
            <div key={a.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5">{SEVERITY_ICON[a.severity]}</span>
                <div className="min-w-0">
                  <p className="text-sm text-text-primary">{a.title}</p>
                  {a.description ? (
                    <p className="mt-0.5 text-[11px] text-text-muted">{a.description}</p>
                  ) : null}
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
                    <span className="font-mono">{a.detector}</span>
                    <span>·</span>
                    <span>first seen {relativeTime(a.first_detected_at)}</span>
                    {a.clients?.slug ? (
                      <>
                        <span>·</span>
                        <Link
                          href={`/admin/clients/${a.clients.slug}/billing`}
                          className="hover:text-text-primary"
                        >
                          {a.clients.name}
                        </Link>
                      </>
                    ) : null}
                  </p>
                </div>
              </div>
              {scope === 'open' ? (
                <button
                  type="button"
                  disabled={busyId === a.id}
                  onClick={() => dismiss(a.id)}
                  className="inline-flex items-center gap-1 rounded-full border border-nativz-border bg-surface px-2 py-0.5 text-[11px] text-text-muted hover:text-text-primary disabled:opacity-50"
                  title="Dismiss"
                >
                  <XCircle size={11} /> Dismiss
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
