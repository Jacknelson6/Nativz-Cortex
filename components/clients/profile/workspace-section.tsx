import Link from 'next/link';
import { ArrowUpRight, Pencil } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * Workspace-settings section: Dovetail-style card with the section title
 * + description living INSIDE at the top, a hairline divider, then the
 * stacked rows. Title slot doubles as the section header, no separate
 * label above the card.
 */
export function WorkspaceSection({
  title,
  description,
  openHref,
  openLabel = 'Open',
  action,
  anchor,
  children,
}: {
  title: string;
  description?: string;
  openHref?: string;
  openLabel?: string;
  /** Right-aligned slot, typically a SectionEditor button. */
  action?: React.ReactNode;
  /** Optional anchor target so deep links from overview jump to this section. */
  anchor?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={anchor}
      className="scroll-mt-24 rounded-2xl border border-nativz-border bg-surface overflow-hidden"
    >
      <header className="flex items-start justify-between gap-4 px-5 sm:px-6 pt-5 sm:pt-6 pb-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-text-primary leading-tight">
            {title}
          </h2>
          {description && (
            <p className="mt-1 text-[12.5px] text-text-muted leading-relaxed max-w-[58ch]">
              {description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {openHref && (
            <Link
              href={openHref}
              className="inline-flex items-center gap-1 text-[12px] text-text-muted hover:text-text-primary transition-colors"
            >
              {openLabel}
              <ArrowUpRight size={12} />
            </Link>
          )}
          {action}
        </div>
      </header>
      <div className="border-t border-nativz-border/70" />
      <div>{children}</div>
    </section>
  );
}

/**
 * Single workspace-style row. Layout:
 *
 *   [optional icon] [label / hint stack flex-1] [value or rightSlot]
 *
 * Bold label, tiny hint underneath, right-aligned action or short value.
 * Long-form values wrap under the label using `multiline` so the right
 * side stays a thin column.
 */
export function WorkspaceRow({
  icon: Icon,
  label,
  hint,
  value,
  empty = 'Not set',
  editHref,
  mono,
  multiline,
  rightSlot,
}: {
  /** Optional left-aligned icon (Lucide). Renders muted, slightly above the label baseline. */
  icon?: LucideIcon;
  label: React.ReactNode;
  /** Tiny one-line description beneath the label. */
  hint?: React.ReactNode;
  value?: React.ReactNode;
  empty?: string;
  /** When provided, hovering the row reveals a small Edit pill linking here. */
  editHref?: string;
  mono?: boolean;
  /** When the value is long-form prose, render it under the label instead of in the right column. */
  multiline?: boolean;
  /** Custom slot rendered on the far right. Overrides `value`. */
  rightSlot?: React.ReactNode;
}) {
  const hasValue =
    rightSlot !== undefined
      ? true
      : value !== undefined && value !== null && value !== '';

  const showRight = !multiline && (rightSlot !== undefined || hasValue || empty);
  const valueTextClass = cn(
    'text-[13px] text-right max-w-[28rem] truncate',
    hasValue ? 'text-text-primary' : 'italic text-text-muted',
    mono && 'font-mono text-xs',
  );

  return (
    <div className="group relative flex items-start gap-3 px-5 sm:px-6 py-4 border-b border-nativz-border/60 last:border-b-0">
      {Icon && (
        <div className="shrink-0 pt-0.5 text-text-muted">
          <Icon size={16} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-text-primary leading-tight">{label}</div>
        {hint && (
          <div className="text-[12px] text-text-muted mt-1 leading-relaxed">{hint}</div>
        )}
        {multiline && hasValue && (
          <div
            className={cn(
              'mt-2 text-[13px] whitespace-pre-wrap leading-relaxed',
              mono ? 'font-mono text-xs text-text-primary' : 'text-text-primary',
            )}
          >
            {value}
          </div>
        )}
      </div>
      {showRight && (
        <div className="shrink-0 flex items-center gap-2 min-w-0">
          {rightSlot !== undefined ? (
            rightSlot
          ) : (
            <div className={valueTextClass}>{hasValue ? value : empty}</div>
          )}
          {editHref && (
            <Link
              href={editHref}
              className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity inline-flex items-center gap-1 rounded-full border border-nativz-border bg-surface px-2 py-0.5 text-[11px] text-text-muted hover:text-text-primary hover:bg-surface-hover shrink-0"
              aria-label={typeof label === 'string' ? `Edit ${label}` : 'Edit'}
            >
              <Pencil size={10} />
              Edit
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
