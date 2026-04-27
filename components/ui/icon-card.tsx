import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * The "section card" pattern used across admin pages — icon + title + optional
 * description in a header strip, content below. Replaces the older two-tier
 * pattern (outer SectionPanel header + inner card with its own h2). Use this
 * when the content is a single bounded surface; for sections that hold lists
 * or grids of items, use SectionPanel/SectionHeading instead so we don't end
 * up nesting cards inside cards.
 */
interface IconCardProps {
  icon: ReactNode;
  title: string;
  description?: string;
  /** Right-aligned slot on the header row — links, "Manage" buttons, etc. */
  action?: ReactNode;
  /** Icon swatch tone. `accent` (default) tints with the brand accent;
   *  `muted` is for secondary cards that shouldn't compete for attention. */
  tone?: 'accent' | 'muted';
  className?: string;
  children: ReactNode;
}

export function IconCard({
  icon,
  title,
  description,
  action,
  tone = 'accent',
  className,
  children,
}: IconCardProps) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-xl border border-nativz-border bg-surface text-text-primary shadow-[var(--shadow-card)]',
        className,
      )}
    >
      <header className="flex items-start gap-3 border-b border-nativz-border/60 px-5 py-4">
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
            tone === 'accent'
              ? 'bg-accent/15 text-accent-text'
              : 'bg-surface-hover text-text-secondary',
          )}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-xs text-text-muted leading-relaxed">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}
