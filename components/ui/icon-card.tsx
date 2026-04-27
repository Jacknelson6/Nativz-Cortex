import type { ReactNode } from 'react';
import { HelpCircle } from 'lucide-react';
import { TooltipCard } from '@/components/ui/tooltip-card';
import { cn } from '@/lib/utils/cn';

/**
 * The "section card" pattern used across admin pages — icon + title + optional
 * description (or `?` tooltip) in a header strip, content below. Replaces the
 * older two-tier pattern (outer SectionPanel header + inner card with its own
 * h2). Use this when the content is a single bounded surface; for sections
 * that hold lists or grids of full cards, use SectionPanel instead so we
 * don't end up nesting cards inside cards.
 *
 * Header tooltip: pass `helpText` to surface a 13px `?` next to the title
 * (mirrors SectionPanel). Prefer this over `description` — the project rule
 * is "no subtext, use a `?` tooltip" so explainers stay one-click-away.
 */
interface IconCardProps {
  icon: ReactNode;
  title: string;
  description?: string;
  /** Long-form explainer surfaced via a `?` tooltip next to the title. */
  helpText?: string;
  /** Optional override for the tooltip heading (defaults to `title`). */
  helpTitle?: string;
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
  helpText,
  helpTitle,
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
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
            {helpText ? (
              <TooltipCard title={helpTitle ?? title} description={helpText} iconTrigger>
                <button
                  type="button"
                  aria-label={`Learn more about ${title}`}
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full text-text-muted/60 transition-colors hover:bg-surface-hover hover:text-text-secondary cursor-help"
                >
                  <HelpCircle size={13} />
                </button>
              </TooltipCard>
            ) : null}
          </div>
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
