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

export function NewTrendMonitorForm({
  clients,
  defaultRecipient,
}: {
  clients: Client[];
  defaultRecipient: string | null;
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState<string>(clients[0]?.id ?? '');
  const [name, setName] = useState('');
  const [topicQuery, setTopicQuery] = useState('');
  const [brandNamesText, setBrandNamesText] = useState('');
  const [keywordsText, setKeywordsText] = useState('');
  const [cadence, setCadence] = useState<(typeof CADENCES)[number]['value']>('weekly');
  const [recipientsText, setRecipientsText] = useState(defaultRecipient ?? '');
  const [includePortal, setIncludePortal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function splitList(text: string): string[] {
    return text
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const recipients = splitList(recipientsText);
    const brandNames = splitList(brandNamesText);
    const keywords = splitList(keywordsText);

    if (!name.trim()) {
      setError('Give the monitor a name');
      setSubmitting(false);
      return;
    }
    if (!topicQuery.trim()) {
      setError('Add a topic query');
      setSubmitting(false);
      return;
    }
    if (recipients.length === 0 && !includePortal) {
      setError('Add at least one recipient or enable portal delivery');
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch('/api/trend-reports/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId || null,
          name,
          topic_query: topicQuery,
          brand_names: brandNames,
          keywords,
          cadence,
          recipients,
          include_portal_users: includePortal,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Create failed');
      router.push('/admin/search/monitors');
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

      <Field label="Monitor name" hint="Internal label — appears as the email subject.">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Avondale brand listening"
          className="w-full rounded-lg border border-nativz-border bg-surface-hover/30 px-3 py-2 text-sm text-text-primary focus:border-cyan-500/50 focus:outline-none"
        />
      </Field>

      <Field label="Client" hint="Optional. Omit for multi-brand or agency-wide monitors.">
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="w-full rounded-lg border border-nativz-border bg-surface-hover/30 px-3 py-2 text-sm text-text-primary focus:border-cyan-500/50 focus:outline-none"
        >
          <option value="">(no client)</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.agency ? ` · ${c.agency}` : ''}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Topic query" hint="What Cortex types into the search engine each cadence.">
        <input
          type="text"
          value={topicQuery}
          onChange={(e) => setTopicQuery(e.target.value)}
          placeholder="truck parking safety, diesel shortages"
          className="w-full rounded-lg border border-nativz-border bg-surface-hover/30 px-3 py-2 text-sm text-text-primary focus:border-cyan-500/50 focus:outline-none"
        />
      </Field>

      <Field
        label="Brand names to listen for"
        hint="Comma or newline separated. Any result containing one of these will be flagged and grouped."
      >
        <textarea
          rows={2}
          value={brandNamesText}
          onChange={(e) => setBrandNamesText(e.target.value)}
          placeholder="Avondale Private Lending"
          className="w-full rounded-lg border border-nativz-border bg-surface-hover/30 px-3 py-2 font-mono text-xs text-text-primary focus:border-cyan-500/50 focus:outline-none"
        />
      </Field>

      <Field
        label="Keyword cues"
        hint="Additional terms to flag (feature names, campaign tags, industry phrases)."
      >
        <textarea
          rows={2}
          value={keywordsText}
          onChange={(e) => setKeywordsText(e.target.value)}
          placeholder="overnight parking, fleet driver"
          className="w-full rounded-lg border border-nativz-border bg-surface-hover/30 px-3 py-2 font-mono text-xs text-text-primary focus:border-cyan-500/50 focus:outline-none"
        />
      </Field>

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

      <Field label="Recipients" hint="One per line or comma-separated.">
        <textarea
          rows={3}
          value={recipientsText}
          onChange={(e) => setRecipientsText(e.target.value)}
          placeholder="team@example.com"
          className="w-full rounded-lg border border-nativz-border bg-surface-hover/30 px-3 py-2 font-mono text-xs text-text-primary focus:border-cyan-500/50 focus:outline-none"
        />
      </Field>

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
            Only applies when a client is picked above.
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
          className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-xs font-semibold uppercase tracking-[2px] text-white transition-colors hover:bg-accent/90 disabled:opacity-60"
          style={{ fontFamily: 'Jost, system-ui, sans-serif' }}
        >
          {submitting ? 'Creating\u2026' : 'Create monitor'}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="block font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted/85">
        {label}
      </label>
      {hint && <p className="text-[11px] text-text-muted">{hint}</p>}
      {children}
    </div>
  );
}
