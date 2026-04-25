'use client';

/**
 * Shared Infrastructure-style pill-tab navigation for admin pages.
 * Used by Infrastructure, AI settings, Notifications, Accounting, Users,
 * Onboarding, and Clients — anywhere a top-level page wants to split content
 * into drill-in tabs. The active tab is stored in the URL (`?tab=slug`) so
 * every tab is deep-linkable and back-navigable.
 *
 * `useSearchParams` requires a Suspense boundary — we wrap the inner
 * implementation so callers don't have to remember that.
 */

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

export interface SectionTabDef {
  slug: string;
  label: string;
  /**
   * Pre-rendered icon element (e.g. `<Activity size={13} />`). Must be a
   * rendered element, not a component reference — RSC serializer cannot
   * pass component functions across the server→client boundary, but
   * rendered React elements serialize cleanly.
   */
  icon: React.ReactNode;
}

interface SectionTabsProps<T extends readonly SectionTabDef[]> {
  tabs: T;
  active: T[number]['slug'];
  /** Optional localStorage key for "last tab" memory. */
  memoryKey?: string;
}

export function SectionTabs<T extends readonly SectionTabDef[]>(props: SectionTabsProps<T>) {
  return (
    <Suspense fallback={<SectionTabsSkeleton count={props.tabs.length} />}>
      <SectionTabsInner {...props} />
    </Suspense>
  );
}

function SectionTabsSkeleton({ count }: { count: number }) {
  return (
    <nav
      aria-label="Section tabs"
      className="flex flex-wrap items-center gap-1 rounded-full border border-nativz-border bg-surface/70 p-1 backdrop-blur"
    >
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className="inline-flex h-7 w-20 items-center gap-2 rounded-full bg-surface-hover/30 px-3"
        />
      ))}
    </nav>
  );
}

function SectionTabsInner<T extends readonly SectionTabDef[]>({
  tabs,
  active,
  memoryKey,
}: SectionTabsProps<T>) {
  const pathname = usePathname();
  const params = useSearchParams();

  useEffect(() => {
    if (!memoryKey) return;
    try {
      window.localStorage.setItem(memoryKey, active);
    } catch {
      /* ignore */
    }
  }, [active, memoryKey]);

  return (
    <nav
      aria-label="Section tabs"
      className="flex flex-wrap items-center gap-1 rounded-full border border-nativz-border bg-surface/70 p-1 backdrop-blur"
    >
      {tabs.map((t) => {
        const isActive = t.slug === active;
        const qs = new URLSearchParams(params);
        qs.set('tab', t.slug);
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
            {t.icon}
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Reusable page header matching the Infrastructure layout:
 *   CORTEX · ADMIN
 *   Title
 *   Description
 *                   [Action slot]
 */
interface SectionHeaderProps {
  title: string;
  /** @deprecated Subtext was retired 2026-04-25 — every admin page now
   *  shows the title alone for a tighter, less-noisy chrome. The prop
   *  stays in the type so existing callers don't need to be updated in
   *  one sweep, but it renders nothing. Drop it from the call site
   *  whenever you touch the file. */
  description?: string;
  action?: React.ReactNode;
}

export function SectionHeader({ title, action }: SectionHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <h1 className="ui-page-title">{title}</h1>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

/** Standard tab body wrapper — matches the TabShell used across pages. */
interface SectionPanelProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
}

export function SectionPanel({ title, description, children }: SectionPanelProps) {
  if (!title && !description) return <>{children}</>;
  return (
    <section className="space-y-4">
      {title || description ? (
        <div>
          {title ? <h2 className="text-base font-semibold text-text-primary">{title}</h2> : null}
          {description ? <p className="mt-1 max-w-2xl text-xs text-text-muted">{description}</p> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Tile component matching the Infrastructure overview pattern. */
interface SectionTileProps {
  href: string;
  icon: React.ReactNode;
  title: string;
  status?: 'ok' | 'warn' | 'soon';
  primary: string;
  secondary?: string;
}

export function SectionTile({ href, icon, title, status = 'ok', primary, secondary }: SectionTileProps) {
  const dot =
    status === 'ok'
      ? 'bg-cyan-400'
      : status === 'warn'
        ? 'bg-amber-400'
        : 'bg-text-muted/60';

  return (
    <Link
      href={href}
      scroll={false}
      className="group flex items-start gap-4 rounded-xl border border-nativz-border bg-surface p-5 transition-colors hover:border-accent/40 hover:bg-surface-hover/30"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent-text">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
        </div>
        <p className="mt-1 truncate text-sm text-text-secondary">{primary}</p>
        {secondary ? <p className="mt-1 text-xs text-text-muted">{secondary}</p> : null}
      </div>
    </Link>
  );
}
