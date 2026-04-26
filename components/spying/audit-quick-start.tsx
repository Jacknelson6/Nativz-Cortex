'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Search } from 'lucide-react';

const URL_HINT = 'Paste a TikTok, Instagram, YouTube or Facebook URL — or just a brand homepage.';

export function AuditQuickStart() {
  const router = useRouter();
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [, startTransition] = useTransition();

  const trimmed = websiteUrl.trim();
  const isValid = trimmed.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid || submitting) return;
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/analyze-social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ website_url: trimmed, attached_client_id: null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to start audit');
        return;
      }
      startTransition(() => router.push(`/admin/analyze-social/${data.id}`));
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      className="animate-ci-rise rounded-xl border border-nativz-border bg-surface p-6"
      style={{ animationDelay: '60ms' }}
    >
      <p
        className="font-mono text-[10px] uppercase tracking-[0.22em] text-cyan-300/80"
        style={{ fontStyle: 'italic', fontFamily: 'Rubik, system-ui, sans-serif' }}
      >
        Run audit
      </p>
      <h2
        className="mt-1 text-lg font-semibold text-text-primary"
        style={{ fontFamily: 'var(--font-nz-display), system-ui, sans-serif' }}
      >
        Audit any brand&apos;s short-form footprint.
      </h2>
      <p className="mt-1 text-xs text-text-muted">
        Auto-discovers competitors. Scorecard back in about four minutes.
      </p>

      <form onSubmit={handleSubmit} className="mt-5 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <div className="relative min-w-0 flex-1">
            <Search
              size={14}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted"
              aria-hidden
            />
            <input
              type="url"
              autoComplete="url"
              spellCheck={false}
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://brand.com or @handle on TikTok / Instagram / YouTube"
              className="h-11 w-full rounded-lg border border-nativz-border bg-surface-hover/30 py-2 pl-9 pr-3 font-mono text-xs text-text-primary placeholder:text-text-muted/70 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-cyan-500/30"
              disabled={submitting}
            />
          </div>
          <button
            type="submit"
            disabled={!isValid || submitting}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-accent px-6 text-[11px] font-semibold uppercase tracking-[2px] text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ fontFamily: 'var(--font-nz-display), system-ui, sans-serif' }}
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
            <span>{submitting ? 'Starting…' : 'Run audit'}</span>
          </button>
        </div>

        <p className="text-[11px] text-text-muted/85">{URL_HINT}</p>

        {error ? (
          <div className="rounded-lg border border-coral-500/30 bg-coral-500/10 px-3 py-2 text-[11px] text-coral-300">
            {error}
          </div>
        ) : null}
      </form>
    </section>
  );
}
