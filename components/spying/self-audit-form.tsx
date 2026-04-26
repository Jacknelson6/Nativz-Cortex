'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles } from 'lucide-react';

interface SelfAuditFormProps {
  initialBrandName: string;
  attachedClientId: string | null;
}

export function SelfAuditForm({ initialBrandName, attachedClientId }: SelfAuditFormProps) {
  const router = useRouter();
  const [brandName, setBrandName] = useState(initialBrandName);
  const [category, setCategory] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [, startTransition] = useTransition();

  const trimmed = brandName.trim();
  const isValid = trimmed.length > 0 && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/brand-audits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand_name: trimmed,
          category: category.trim() || null,
          attached_client_id: attachedClientId,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.id) {
        setError(data?.error ?? 'Failed to run audit');
        return;
      }
      startTransition(() => router.push(`/spying/self-audit/${data.id}`));
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label
            htmlFor="brand-name"
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted"
          >
            Brand name
          </label>
          <input
            id="brand-name"
            type="text"
            autoComplete="off"
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            placeholder="Nativz"
            className="mt-1.5 h-10 w-full rounded-lg border border-nativz-border bg-surface-hover/30 px-3 text-sm text-text-primary placeholder:text-text-muted/70 focus-visible:border-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60"
            disabled={submitting}
          />
        </div>

        <div>
          <label
            htmlFor="brand-category"
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted"
          >
            Category <span className="opacity-60">(optional)</span>
          </label>
          <input
            id="brand-category"
            type="text"
            autoComplete="off"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. content marketing agencies"
            className="mt-1.5 h-10 w-full rounded-lg border border-nativz-border bg-surface-hover/30 px-3 text-sm text-text-primary placeholder:text-text-muted/70 focus-visible:border-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60"
            disabled={submitting}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!isValid}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-white transition-colors hover:bg-accent/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          <span>{submitting ? 'Running audit…' : 'Run self-audit'}</span>
        </button>
        <span className="text-[11px] text-text-muted">
          Uses Claude · GPT · Gemini with web search.
        </span>
      </div>

      {error ? (
        <div className="rounded-lg border border-coral-500/30 bg-coral-500/10 px-3 py-2 text-[11px] text-coral-300">
          {error}
        </div>
      ) : null}
    </form>
  );
}
