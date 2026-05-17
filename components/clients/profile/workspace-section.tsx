import Link from 'next/link';
import { ArrowUpRight, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * Workspace-settings section: a labelled block with a stack of label-left /
 * value-right rows. Matches the Mobbin reference: section title at the top,
 * optional description, then a thin card with a divider between each row.
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
    <section className="space-y-3" id={anchor}>
      <header className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-text-primary leading-tight">{title}</h2>
          {description && (
            <p className="text-xs text-text-muted mt-1 leading-relaxed">{description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {openHref && (
            <Link
              href={openHref}
              className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors"
            >
              {openLabel}
              <ArrowUpRight size={12} />
            </Link>
          )}
          {action}
        </div>
      </header>
      <div className="rounded-xl border border-nativz-border bg-surface overflow-hidden">
        {children}
      </div>
    </section>
  );
}

/**
 * Single workspace-style row. Label on the left (fixed column), value on the
 * right, with an optional "Edit" jump pill that appears on hover and links to
 * the per-section editor.
 */
export function WorkspaceRow({
  label,
  hint,
  value,
  empty = 'Not set',
  editHref,
  mono,
  multiline,
  rightSlot,
}: {
  label: string;
  /** Tiny one-line description beneath the label. */
  hint?: string;
  value?: React.ReactNode;
  empty?: string;
  /** When provided, hovering the row reveals a small Edit pill linking here. */
  editHref?: string;
  mono?: boolean;
  /** When the value is long-form prose, drop the truncation so it wraps. */
  multiline?: boolean;
  /** Custom slot rendered on the far right (e.g. logo preview). Overrides value. */
  rightSlot?: React.ReactNode;
}) {
  const hasValue =
    rightSlot !== undefined
      ? true
      : value !== undefined && value !== null && value !== '';
  return (
    <div className="group relative grid grid-cols-1 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)] gap-2 sm:gap-6 px-4 py-3.5 border-b border-nativz-border/60 last:border-b-0">
      <div className="min-w-0">
        <div className="text-sm font-medium text-text-secondary">{label}</div>
        {hint && <div className="text-xs text-text-muted mt-0.5">{hint}</div>}
      </div>
      <div className="min-w-0 flex items-start justify-between gap-3">
        <div
          className={cn(
            'min-w-0 text-sm',
            hasValue ? 'text-text-primary' : 'italic text-text-muted',
            mono && 'font-mono',
            multiline ? 'whitespace-pre-wrap leading-relaxed' : 'truncate',
          )}
        >
          {rightSlot ?? (hasValue ? value : empty)}
        </div>
        {editHref && (
          <Link
            href={editHref}
            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity inline-flex items-center gap-1 rounded-full border border-nativz-border bg-surface px-2 py-0.5 text-[11px] text-text-muted hover:text-text-primary hover:bg-surface-hover shrink-0"
            aria-label={`Edit ${label}`}
          >
            <Pencil size={10} />
            Edit
          </Link>
        )}
      </div>
    </div>
  );
}
