// SPY-09 T16: closing panel. Internal variant = static CTA the rep
// talks to. Public variant = same headline + a 3-field lead-capture
// form (name / email / notes). Form is the only client-side bit so
// the rest of the public page can stay server-rendered.

'use client';

import { useState } from 'react';
import type { PresentationContact } from '@/lib/prospects/types';

interface Props {
  contact: PresentationContact;
  variant: 'internal' | 'public';
  token?: string; // required for public variant
}

export function PanelNextStep({ contact, variant, token }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const payload = {
      name: String(form.get('name') ?? ''),
      email: String(form.get('email') ?? ''),
      notes: String(form.get('notes') ?? ''),
    };
    try {
      const res = await fetch(`/api/shared/prospect-present/${token}/lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? 'Something went wrong.');
        return;
      }
      setSubmitted(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-full flex-col justify-center px-12">
      <div className="text-base uppercase tracking-[0.3em] text-zinc-400">
        Next step
      </div>
      <h2 className="mt-3 text-[48px] font-semibold leading-tight text-white">
        Let&apos;s turn this into a 90-day production plan.
      </h2>

      {variant === 'internal' ? (
        <div className="mt-10 max-w-3xl text-2xl leading-relaxed text-zinc-300">
          Talk to <span className="text-white">{contact.sales_rep_name}</span> at{' '}
          <a href={`mailto:${contact.sales_rep_email}`} className="text-emerald-300 underline">
            {contact.sales_rep_email}
          </a>{' '}
          to get started.
        </div>
      ) : submitted ? (
        <div className="mt-10 max-w-3xl text-2xl leading-relaxed text-emerald-300">
          Got it. {contact.sales_rep_name} will be in touch shortly.
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-10 grid max-w-2xl gap-5">
          <label className="block">
            <span className="text-sm uppercase tracking-[0.25em] text-zinc-400">Your name</span>
            <input
              name="name"
              required
              maxLength={120}
              className="mt-2 w-full rounded-md border border-zinc-700 bg-zinc-900 px-4 py-3 text-xl text-white outline-none focus:border-emerald-400"
            />
          </label>
          <label className="block">
            <span className="text-sm uppercase tracking-[0.25em] text-zinc-400">Email</span>
            <input
              name="email"
              type="email"
              required
              className="mt-2 w-full rounded-md border border-zinc-700 bg-zinc-900 px-4 py-3 text-xl text-white outline-none focus:border-emerald-400"
            />
          </label>
          <label className="block">
            <span className="text-sm uppercase tracking-[0.25em] text-zinc-400">
              What&apos;s most exciting?
            </span>
            <textarea
              name="notes"
              maxLength={2000}
              rows={4}
              className="mt-2 w-full rounded-md border border-zinc-700 bg-zinc-900 px-4 py-3 text-lg text-white outline-none focus:border-emerald-400"
            />
          </label>
          {error ? <div className="text-base text-rose-400">{error}</div> : null}
          <button
            type="submit"
            disabled={submitting}
            className="mt-2 w-fit rounded-md bg-emerald-400 px-6 py-3 text-lg font-semibold text-black hover:bg-emerald-300 disabled:opacity-50"
          >
            {submitting ? 'Sending…' : 'Send'}
          </button>
        </form>
      )}

      <div className="absolute bottom-10 text-sm uppercase tracking-[0.25em] text-zinc-500">
        Powered by Nativz
      </div>
    </div>
  );
}
