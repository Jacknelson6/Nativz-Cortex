'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Client {
  id: string;
  name: string;
  agency: string | null;
}

const CADENCES = [
  { value: 'weekly', label: 'Weekly', description: 'Every 7 days' },
  { value: 'biweekly', label: 'Biweekly', description: 'Every 14 days' },
  { value: 'monthly', label: 'Monthly', description: 'Every 30 days' },
] as const;

export function NewSubscriptionForm({
  clients,
  defaultRecipient,
}: {
  clients: Client[];
  defaultRecipient: string | null;
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState(clients[0]?.id ?? '');
  const [cadence, setCadence] = useState<(typeof CADENCES)[number]['value']>('weekly');
  const [recipientsText, setRecipientsText] = useState(defaultRecipient ?? '');
  const [includePortal, setIncludePortal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const recipients = recipientsText
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (!clientId) {
      setError('Pick a client');
      setSubmitting(false);
      return;
    }
    if (recipients.length === 0 && !includePortal) {
      setError('Add at least one recipient or enable portal delivery');
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch('/api/competitor-reports/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          cadence,
          recipients,
          include_portal_users: includePortal,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Create failed');
      router.push('/admin/competitor-intelligence/reports');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6 rounded-xl border border-nativz-border bg-surface p-6">
      {error && (
        <div className="rounded-lg border border-coral-500/30 bg-coral-500/10 px-3 py-2 text-xs text-coral-300">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <label className="block font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted/85">
          Client
        </label>
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="w-full rounded-lg border border-nativz-border bg-surface-hover/30 px-3 py-2 text-sm text-text-primary focus:border-cyan-500/50 focus:outline-none"
        >
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.agency ? ` · ${c.agency}` : ''}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="space-y-2">
        <legend className="block font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted/85">
          Cadence
        </legend>
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
      </fieldset>

      <div className="space-y-2">
        <label className="block font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted/85">
          Recipients (one per line or comma-separated)
        </label>
        <textarea
          rows={4}
          value={recipientsText}
          onChange={(e) => setRecipientsText(e.target.value)}
          placeholder="team@example.com"
          className="w-full rounded-lg border border-nativz-border bg-surface-hover/30 px-3 py-2 font-mono text-xs text-text-primary focus:border-cyan-500/50 focus:outline-none"
        />
      </div>

      <label className="flex items-start gap-3 rounded-lg border border-nativz-border bg-surface-hover/30 px-4 py-3">
        <input
          type="checkbox"
          checked={includePortal}
          onChange={(e) => setIncludePortal(e.target.checked)}
          className="mt-0.5 accent-cyan-400"
        />
        <div>
          <div className="text-sm text-text-primary">Also send to portal users for this client</div>
          <div className="mt-0.5 text-[11px] text-text-muted">
            Every `viewer` in the client&apos;s organization will be added to the recipient list at send time.
          </div>
        </div>
      </label>

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
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-full bg-[#9314CE] px-5 py-2 text-xs font-semibold uppercase tracking-[2px] text-white transition-colors hover:bg-[#7A0FB0] disabled:opacity-60"
          style={{ fontFamily: 'Jost, system-ui, sans-serif' }}
        >
          {submitting ? 'Creating…' : 'Create subscription'}
        </button>
      </div>
    </form>
  );
}
