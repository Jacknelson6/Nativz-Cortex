'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  Activity,
  Database,
  Gauge,
  Layers,
  Plug,
  Server,
  Sliders,
  Zap,
} from 'lucide-react';
import { useEffect } from 'react';

const TABS = [
  { slug: 'overview',     label: 'Overview',     icon: Activity },
  { slug: 'compute',      label: 'Compute',      icon: Server },
  { slug: 'database',     label: 'Database',     icon: Database },
  { slug: 'pipelines',    label: 'Pipelines',    icon: Gauge },
  { slug: 'ai',           label: 'AI',           icon: Layers },
  { slug: 'apify',        label: 'Scrapers',     icon: Zap },
  { slug: 'trend-finder', label: 'Trend finder', icon: Sliders },
  { slug: 'integrations', label: 'Integrations', icon: Plug },
] as const;

export type InfrastructureTabSlug = (typeof TABS)[number]['slug'];

export function InfrastructureTabs({ active }: { active: InfrastructureTabSlug }) {
  const pathname = usePathname();
  const params = useSearchParams();

  useEffect(() => {
    try {
      window.localStorage.setItem('cortex:infrastructure:last-tab', active);
    } catch {
      /* private mode / storage disabled — ignore */
    }
  }, [active]);

  return (
    <nav
      aria-label="Infrastructure sections"
      className="flex flex-wrap items-center gap-1 rounded-full border border-nativz-border bg-surface/70 p-1 backdrop-blur"
    >
      {TABS.map((t) => {
        const isActive = t.slug === active;
        const qs = new URLSearchParams(params);
        qs.set('tab', t.slug);
        const Icon = t.icon;
        return (
          <Link
            key={t.slug}
            href={`${pathname}?${qs.toString()}`}
            scroll={false}
            className={
              'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ' +
              (isActive
                ? 'bg-accent/15 text-accent-text ring-1 ring-inset ring-accent/40'
                : 'text-text-secondary hover:bg-surface-hover/60 hover:text-text-primary')
            }
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon size={13} />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
