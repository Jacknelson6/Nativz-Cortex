'use client';

/**
 * Shared admin sub-page navigation. Delegates to the canonical `SubNavLinks`
 * primitive (`components/ui/sub-nav.tsx`) so every admin surface that splits
 * into tabs — Infrastructure, AI settings, Notifications, Accounting, Users,
 * Revenue — picks up the same underlined strip with one source of truth.
 *
 * The strip is URL-driven (`?tab=slug`) so each tab is deep-linkable and
 * back-navigable; `memoryKey` opts in to localStorage "last tab" recall.
 */

import { HelpCircle } from 'lucide-react';
import Link from 'next/link';
import { TooltipCard } from '@/components/ui/tooltip-card';
import { SubNavLinks } from '@/components/ui/sub-nav';

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

export function SectionTabs<T extends readonly SectionTabDef[]>({
  tabs,
  active,
  memoryKey,
}: SectionTabsProps<T>) {
  return (
    <SubNavLinks
      items={tabs}
      active={active}
      memoryKey={memoryKey}
      optimistic={false}
      ariaLabel="Section tabs"
    />
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
  /**
   * Optional icon swatch rendered before the title (matches the IconCard
   * pattern). Use when the section's body is itself a list of cards, so the
   * heading reads as "owned" by an icon without nesting cards.
   */
  icon?: React.ReactNode;
  /**
   * Long-form explainer surfaced via a `?` tooltip next to the title — keeps
   * the page visually quiet while still answering "what is this?" on demand.
   */
  helpText?: string;
  /** Optional override for the tooltip heading (defaults to `title`). */
  helpTitle?: string;
  /** Right-aligned slot rendered on the same row as the title (e.g. action button). */
  action?: React.ReactNode;
  children: React.ReactNode;
}

export function SectionPanel({
  title,
  description,
  icon,
  helpText,
  helpTitle,
  action,
  children,
}: SectionPanelProps) {
  const hasHeader = !!title || !!description || !!helpText || !!action || !!icon;
  if (!hasHeader) return <>{children}</>;
  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex min-w-0 items-start gap-3">
          {icon ? (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent-text">
              {icon}
            </div>
          ) : null}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {title ? <h2 className="text-base font-semibold text-text-primary">{title}</h2> : null}
              {helpText ? (
                <TooltipCard title={helpTitle ?? title ?? ''} description={helpText} iconTrigger>
                  <button
                    type="button"
                    aria-label={`Learn more about ${title ?? 'this section'}`}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full text-text-muted/60 transition-colors hover:bg-surface-hover hover:text-text-secondary cursor-help"
                  >
                    <HelpCircle size={13} />
                  </button>
                </TooltipCard>
              ) : null}
            </div>
            {description ? <p className="mt-1 max-w-2xl text-xs text-text-muted">{description}</p> : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
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
        <p className="mt-1 text-sm text-text-secondary">{primary}</p>
        {secondary ? <p className="mt-1 text-xs text-text-muted">{secondary}</p> : null}
      </div>
    </Link>
  );
}
