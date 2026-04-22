'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Globe, Instagram, Plus, Trash2, Youtube, Facebook, Music2 } from 'lucide-react';

interface Client {
  id: string;
  name: string;
  agency: string | null;
  logo_url: string | null;
}

type Platform = 'tiktok' | 'instagram' | 'youtube' | 'facebook' | 'unknown';

interface ProfileRow {
  id: string;
  url: string;
  detected_platform: Platform;
  detected_handle: string | null;
  error: string | null;
}

const CADENCES = [
  { value: 'weekly', label: 'Weekly', description: 'Snapshots every 7 days' },
  { value: 'biweekly', label: 'Biweekly', description: 'Snapshots every 14 days' },
  { value: 'monthly', label: 'Monthly', description: 'Snapshots every 30 days' },
] as const;

function detectPlatform(raw: string): Pick<ProfileRow, 'detected_platform' | 'detected_handle' | 'error'> {
  const trimmed = raw.trim();
  if (!trimmed) return { detected_platform: 'unknown', detected_handle: null, error: null };
  let url: URL;
  try {
    url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
  } catch {
    return { detected_platform: 'unknown', detected_handle: null, error: 'Not a valid URL' };
  }
  const host = url.hostname.replace(/^www\./, '');
  const segs = url.pathname.split('/').filter(Boolean);
  if (host === 'tiktok.com') {
    const handle = segs[0]?.replace(/^@/, '') ?? null;
    return { detected_platform: 'tiktok', detected_handle: handle, error: handle ? null : 'Missing handle' };
  }
  if (host === 'instagram.com') {
    const handle = segs[0] ?? null;
    return {
      detected_platform: 'instagram',
      detected_handle: handle,
      error: handle ? null : 'Missing handle',
    };
  }
  if (host === 'youtube.com' || host === 'youtu.be') {
    const handle = segs[0]?.replace(/^@/, '') ?? null;
    return { detected_platform: 'youtube', detected_handle: handle, error: handle ? null : 'Missing handle' };
  }
  if (host === 'facebook.com' || host === 'm.facebook.com' || host === 'fb.com') {
    const handle = segs[0] ?? null;
    return {
      detected_platform: 'facebook',
      detected_handle: handle,
      error: handle ? null : 'Missing handle',
    };
  }
  return { detected_platform: 'unknown', detected_handle: null, error: 'Unsupported platform' };
}

function platformIcon(p: Platform) {
  switch (p) {
    case 'tiktok':
      return <Music2 size={13} />;
    case 'instagram':
      return <Instagram size={13} />;
    case 'youtube':
      return <Youtube size={13} />;
    case 'facebook':
      return <Facebook size={13} />;
    default:
      return <Globe size={13} />;
  }
}

let rowIdCounter = 0;
function newRow(): ProfileRow {
  rowIdCounter += 1;
  return { id: `row-${rowIdCounter}`, url: '', detected_platform: 'unknown', detected_handle: null, error: null };
}

export function WatchWizard({ clients }: { clients: Client[] }) {
  const router = useRouter();
  const [clientId, setClientId] = useState(clients[0]?.id ?? '');
  const [rows, setRows] = useState<ProfileRow[]>([newRow()]);
  const [cadence, setCadence] = useState<(typeof CADENCES)[number]['value']>('weekly');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validRows = useMemo(
    () => rows.filter((r) => r.url.trim() && !r.error && r.detected_platform !== 'unknown'),
    [rows],
  );

  function updateRow(id: string, url: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, url, ...detectPlatform(url) }
          : r,
      ),
    );
  }

  function addRow() {
    if (rows.length >= 5) return;
    setRows((prev) => [...prev, newRow()]);
  }

  function removeRow(id: string) {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.id !== id)));
  }

  async function submit() {
    if (!clientId) {
      setError('Pick a client first');
      return;
    }
    if (validRows.length === 0) {
      setError('Add at least one valid competitor profile');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const urls = validRows.map((r) => r.url.trim());
      const res = await fetch('/api/benchmarks/watch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, cadence, urls }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Failed to set up watch');
      router.push(`/admin/analytics?tab=benchmarking&justAdded=${clientId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set up watch');
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-coral-500/30 bg-coral-500/10 px-4 py-3 text-xs text-coral-300">
          {error}
        </div>
      )}

      <Step number={1} title="Pick a client">
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="w-full rounded-lg border border-nativz-border bg-surface-hover/30 px-3 py-2.5 text-sm text-text-primary focus:border-cyan-500/50 focus:outline-none"
        >
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.agency ? ` · ${c.agency}` : ''}
            </option>
          ))}
        </select>
      </Step>

      <Step number={2} title="Add competitor profiles" hint="Paste the TikTok, Instagram, YouTube or Facebook URL.">
        <div className="space-y-2">
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex items-center gap-2 rounded-lg border border-nativz-border bg-surface-hover/20 p-2"
            >
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-500/10 text-cyan-300">
                {platformIcon(row.detected_platform)}
              </span>
              <div className="min-w-0 flex-1">
                <input
                  type="url"
                  value={row.url}
                  onChange={(e) => updateRow(row.id, e.target.value)}
                  placeholder="https://tiktok.com/@handle"
                  className="w-full rounded-md border border-nativz-border/60 bg-surface/60 px-3 py-1.5 font-mono text-xs text-text-primary focus:border-cyan-500/50 focus:outline-none"
                />
                {row.url && row.detected_handle && (
                  <div className="mt-1 flex items-center gap-2 text-[11px]">
                    <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-cyan-300">
                      {row.detected_platform}
                    </span>
                    <span className="font-mono text-text-muted">@{row.detected_handle}</span>
                  </div>
                )}
                {row.error && row.url.trim() && (
                  <div className="mt-1 text-[11px] text-coral-300">{row.error}</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeRow(row.id)}
                disabled={rows.length === 1}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-nativz-border/60 text-text-muted hover:border-coral-500/30 hover:text-coral-300 disabled:opacity-30"
                aria-label="Remove row"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addRow}
            disabled={rows.length >= 5}
            className="inline-flex items-center gap-2 rounded-lg border border-dashed border-nativz-border px-4 py-2 text-xs text-text-muted hover:border-cyan-500/30 hover:text-cyan-300 disabled:opacity-40"
          >
            <Plus size={12} />
            Add another {rows.length >= 5 && '(max 5)'}
          </button>
        </div>
      </Step>

      <Step number={3} title="Pick cadence">
        <div className="grid grid-cols-3 gap-2">
          {CADENCES.map((c) => (
            <label
              key={c.value}
              className={
                'cursor-pointer rounded-lg border px-4 py-3 text-sm transition-colors ' +
                (cadence === c.value
                  ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-200'
                  : 'border-nativz-border bg-surface-hover/30 text-text-secondary hover:border-nativz-border/90')
              }
            >
              <input
                type="radio"
                name="cadence"
                value={c.value}
                checked={cadence === c.value}
                onChange={() => setCadence(c.value)}
                className="sr-only"
              />
              <div className="text-sm font-semibold text-text-primary">{c.label}</div>
              <div className="mt-0.5 text-[11px] text-text-muted">{c.description}</div>
            </label>
          ))}
        </div>
      </Step>

      <div className="flex items-center justify-end gap-3 border-t border-nativz-border/60 pt-5">
        <button
          type="button"
          onClick={() => router.back()}
          disabled={submitting}
          className="text-xs text-text-muted hover:text-text-primary disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={submitting || validRows.length === 0}
          className="inline-flex items-center gap-2 rounded-full bg-[#9314CE] px-6 py-2.5 text-[11px] font-semibold uppercase tracking-[2px] text-white transition-colors hover:bg-[#7A0FB0] disabled:opacity-60"
          style={{ fontFamily: 'Jost, system-ui, sans-serif' }}
        >
          {submitting ? 'Setting up…' : `Start watching ${validRows.length || ''}`.trim()}
        </button>
      </div>
    </div>
  );
}

function Step({
  number,
  title,
  hint,
  children,
}: {
  number: number;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-nativz-border bg-surface p-5">
      <div className="flex items-baseline gap-3">
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-500/10 text-[11px] font-semibold text-cyan-300">
          {number}
        </span>
        <h2
          className="text-lg font-semibold text-text-primary"
          style={{ fontFamily: 'Jost, system-ui, sans-serif' }}
        >
          {title}
        </h2>
      </div>
      {hint && <p className="text-xs text-text-muted">{hint}</p>}
      {children}
    </section>
  );
}
