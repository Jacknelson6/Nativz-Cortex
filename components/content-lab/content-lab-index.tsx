'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Compass, Search } from 'lucide-react';
import { ClientLogo } from '@/components/clients/client-logo';
import { cn } from '@/lib/utils/cn';

export type ContentLabClientRow = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
};

function greetingDisplayName(raw: string | null | undefined): string {
  const t = raw?.trim();
  if (!t) return 'there';
  const first = t.split(/\s+/)[0] ?? t;
  if (!first) return 'there';
  return first.charAt(0).toUpperCase() + first.slice(1);
}

function OnboardCtaFooter() {
  return (
    <div className="mt-10 border-t border-nativz-border/35 pt-8 text-center">
      <p className="text-sm text-text-muted">
        Don&apos;t see the client you&apos;re looking for?{' '}
        <Link
          href="/admin/clients/onboard"
          className="inline-flex items-center gap-1 font-semibold text-accent-text underline-offset-4 transition hover:text-accent-hover hover:underline"
        >
          Onboard them
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </p>
    </div>
  );
}

export function ContentLabIndex({
  clients,
  userFirstName,
}: {
  clients: ContentLabClientRow[];
  userFirstName: string | null;
}) {
  const [q, setQ] = useState('');
  const greeting = greetingDisplayName(userFirstName);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return clients;
    return clients.filter(
      (c) => c.name.toLowerCase().includes(s) || c.slug.toLowerCase().includes(s),
    );
  }, [clients, q]);

  return (
    <div className="cortex-page-gutter pb-12">
      <section className="mx-auto w-full max-w-3xl pt-4 sm:pt-6 md:pt-8">
        <div className="text-center">
          <p className="text-sm font-medium text-text-muted">Hello, {greeting}</p>
          <div className="mt-1 flex items-center justify-center gap-2">
            <Compass className="h-6 w-6 text-accent-text md:h-7 md:w-7" aria-hidden />
            <h1 className="text-xl font-semibold tracking-tight text-text-primary md:text-2xl">
              Strategy lab
            </h1>
          </div>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-text-muted">
            Open a client workspace to merge topic searches, review brand DNA and pillars, and jump to mood
            boards.
          </p>
        </div>

        <div className="mx-auto mt-5 w-full max-w-xl md:mt-6">
          <div
            className={cn(
              'overflow-hidden rounded-[1.75rem] border border-nativz-border bg-surface-hover/35 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_8px_32px_-12px_rgba(0,0,0,0.45)]',
              'transition-colors focus-within:border-accent/35 focus-within:bg-surface-hover/50',
              'focus-within:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_0_0_1px_rgba(91,163,230,0.12),0_12px_40px_-16px_rgba(0,0,0,0.5)]',
            )}
          >
            <label htmlFor="content-lab-client-filter" className="sr-only">
              Filter clients
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-text-muted md:left-5"
                aria-hidden
              />
              <input
                id="content-lab-client-filter"
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search clients by name or slug…"
                autoComplete="off"
                className="w-full min-h-[3.25rem] border-0 bg-transparent py-3 pl-11 pr-4 text-sm font-normal leading-relaxed text-foreground placeholder:text-text-muted/80 focus:outline-none md:min-h-[3.5rem] md:pl-12 md:pr-5 md:text-base"
              />
            </div>
          </div>
        </div>

        {clients.length === 0 ? (
          <>
            <p className="mt-8 rounded-xl border border-nativz-border/60 bg-surface p-6 text-center text-sm text-text-muted">
              No active clients yet.{' '}
              <Link href="/admin/clients" className="text-accent-text underline-offset-4 hover:underline">
                Add a client
              </Link>{' '}
              first.
            </p>
            <OnboardCtaFooter />
          </>
        ) : (
          <>
            <p className="mt-6 text-center text-xs text-text-muted">
              {filtered.length === clients.length
                ? `${clients.length} client${clients.length === 1 ? '' : 's'}`
                : `${filtered.length} of ${clients.length} shown`}
            </p>
            {filtered.length === 0 ? (
              <p className="mt-4 text-center text-sm text-text-muted">
                No matches for “{q.trim()}”. Try a different search.
              </p>
            ) : (
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {filtered.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/lab/${c.id}`}
                      className={cn(
                        'group flex h-full min-h-[5.25rem] items-center gap-4 rounded-2xl border border-nativz-border/60 bg-surface/80 p-4',
                        'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] transition-all',
                        'hover:border-accent/30 hover:bg-surface-hover/30 hover:shadow-[0_8px_28px_-12px_rgba(0,0,0,0.45)]',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                      )}
                    >
                      <ClientLogo src={c.logo_url} name={c.name} size="lg" className="shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium leading-snug text-foreground transition group-hover:text-accent-text">
                          {c.name}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-text-muted">{c.slug}</p>
                      </div>
                      <ArrowRight
                        className="h-5 w-5 shrink-0 text-text-muted opacity-60 transition group-hover:translate-x-0.5 group-hover:text-accent-text"
                        aria-hidden
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <OnboardCtaFooter />
          </>
        )}
      </section>
    </div>
  );
}
