'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Activity,
  Layers,
  Loader2,
  Plug,
  Server,
  Sliders,
  Zap,
} from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';

const TABS = [
  { slug: 'overview',     label: 'Overview',     icon: Activity },
  { slug: 'compute',      label: 'Compute',      icon: Server },
  { slug: 'ai',           label: 'AI',           icon: Layers },
  { slug: 'apify',        label: 'Scrapers',     icon: Zap },
  { slug: 'trend-finder', label: 'Trend finder', icon: Sliders },
  { slug: 'integrations', label: 'Integrations', icon: Plug },
] as const;

export type InfrastructureTabSlug = (typeof TABS)[number]['slug'];

/**
 * Tab switches are RSC navigations — the router has to fetch the new tab's
 * payload from the server before React has anything new to render, so the
 * old content lingers (~200-600ms) and the nav feels frozen. We can't make
 * the network faster, but we can make the click *feel* snappy: paint the
 * clicked tab as active immediately (optimistic), dim the old one, and show
 * a spinner on the pending tab + a hairline progress bar under the nav
 * until the new tree commits.
 */
export function InfrastructureTabs({ active }: { active: InfrastructureTabSlug }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [pendingSlug, setPendingSlug] = useState<InfrastructureTabSlug | null>(null);

  // Once the URL catches up, clear the optimistic marker.
  useEffect(() => {
    if (pendingSlug === active) setPendingSlug(null);
  }, [active, pendingSlug]);

  useEffect(() => {
    try {
      window.localStorage.setItem('cortex:infrastructure:last-tab', active);
    } catch {
      /* private mode / storage disabled — ignore */
    }
  }, [active]);

  const displayActive = pendingSlug ?? active;

  function go(slug: InfrastructureTabSlug) {
    if (slug === displayActive) return;
    const qs = new URLSearchParams(params);
    qs.set('tab', slug);
    setPendingSlug(slug);
    startTransition(() => {
      router.push(`${pathname}?${qs.toString()}`, { scroll: false });
    });
  }

  return (
    <div className="relative">
      <nav
        aria-label="Infrastructure sections"
        className="flex flex-wrap items-center gap-1 rounded-full border border-nativz-border bg-surface/70 p-1 backdrop-blur"
      >
        {TABS.map((t) => {
          const isActive = t.slug === displayActive;
          const showSpinner = isPending && t.slug === pendingSlug;
          const Icon = t.icon;
          return (
            <button
              key={t.slug}
              type="button"
              onClick={() => go(t.slug)}
              className={
                'inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors cursor-pointer ' +
                (isActive
                  ? 'bg-accent/15 text-accent-text ring-1 ring-inset ring-accent/40'
                  : 'text-text-secondary hover:bg-surface-hover/60 hover:text-text-primary')
              }
              aria-current={isActive ? 'page' : undefined}
            >
              {showSpinner ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Icon size={14} />
              )}
              {t.label}
            </button>
          );
        })}
      </nav>

      {/* Hairline progress bar — paints the instant a tab is clicked and
         clears when the new RSC commits. Signals "work in flight" without
         replacing any content. */}
      <span
        aria-hidden
        className={
          'pointer-events-none absolute -bottom-px left-4 right-4 h-px origin-left transition-transform duration-500 bg-gradient-to-r from-transparent via-accent/70 to-transparent ' +
          (isPending ? 'scale-x-100' : 'scale-x-0')
        }
      />
    </div>
  );
}
