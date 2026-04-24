'use client';

import { forwardRef, useEffect, useRef } from 'react';
import { Pencil, X, Check, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * InfoCard — the single section-card primitive for /admin/clients/[slug]/settings/info.
 * Mirrors the portal brand-profile card language (flat `bg-surface`, rounded-xl,
 * icon-in-header, ALL-CAPS field labels) and adds a read-first/edit-state contract:
 *
 *   - Read state: icon + title + (optional) description in the header; a ghost
 *     pill "Edit" in the corner when `onEdit` is supplied. Children render the
 *     read view.
 *   - Edit state: the Edit pill is replaced by a Cancel (ghost) + Save (primary)
 *     pair. A bottom footer row shows an italic helper note on the left and a
 *     "Generate with AI" pill on the right when `aiGenerate` is supplied.
 *
 * Colors route entirely through `--accent*` / `--text-*` CSS variables so AC
 * brand mode automatically swaps cyan → teal without any branching here.
 */

export type InfoCardAction = {
  /** If omitted, button is hidden. */
  onClick?: () => void;
  loading?: boolean;
  disabled?: boolean;
  label?: string;
};

export interface InfoCardProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  /** Right-aligned slot that shows next to the edit controls (e.g. "Updated 3d ago"). */
  rightSlot?: React.ReactNode;
  /** 'read' | 'edit'. If undefined, the card is read-only with no edit controls. */
  state?: 'read' | 'edit';
  edit?: InfoCardAction;
  cancel?: InfoCardAction;
  save?: InfoCardAction & { dirty?: boolean };
  /** Shown bottom-right in edit state only. */
  aiGenerate?: InfoCardAction;
  /** Italic helper line shown bottom-left in edit state. */
  footerNote?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export const InfoCard = forwardRef<HTMLElement, InfoCardProps>(function InfoCard(
  {
    icon,
    title,
    description,
    rightSlot,
    state,
    edit,
    cancel,
    save,
    aiGenerate,
    footerNote,
    className,
    children,
  },
  ref,
) {
  const isEditing = state === 'edit';
  const showFooter = isEditing && (aiGenerate?.onClick || footerNote);
  const localRef = useRef<HTMLElement | null>(null);

  // Keyboard shortcuts while editing:
  //   Escape          → cancel
  //   Cmd/Ctrl+Enter  → save (only when dirty)
  // Scoped to focus within this card so one page with multiple cards in
  // edit mode doesn't fight over keystrokes.
  useEffect(() => {
    if (!isEditing) return;
    const el = localRef.current;
    if (!el) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && cancel?.onClick && !cancel.loading) {
        e.preventDefault();
        cancel.onClick();
        return;
      }
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key === 'Enter' &&
        save?.onClick &&
        save.dirty !== false &&
        !save.loading
      ) {
        e.preventDefault();
        save.onClick();
      }
    }
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [isEditing, cancel, save]);

  return (
    <section
      ref={(node) => {
        localRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLElement | null>).current = node;
      }}
      className={cn(
        'rounded-xl border border-nativz-border bg-surface p-5 sm:p-6',
        'transition-colors',
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-lg bg-accent-surface text-accent-text ring-1 ring-inset ring-accent/10">
            {icon}
          </div>
          <div className="min-w-0 pt-0.5">
            <h2 className="text-sm font-semibold text-text-primary leading-tight">
              {title}
            </h2>
            {description && (
              <p className="text-xs text-text-muted mt-1 leading-relaxed">
                {description}
              </p>
            )}
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-2">
          {rightSlot}

          {!isEditing && edit?.onClick && (
            <button
              type="button"
              onClick={edit.onClick}
              disabled={edit.disabled}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border border-nativz-border px-3 py-1.5',
                'text-xs text-text-secondary hover:text-text-primary hover:bg-surface-hover',
                'transition-colors disabled:opacity-50 disabled:pointer-events-none',
              )}
            >
              <Pencil size={12} />
              {edit.label ?? 'Edit'}
            </button>
          )}

          {isEditing && cancel?.onClick && (
            <button
              type="button"
              onClick={cancel.onClick}
              disabled={cancel.disabled || cancel.loading}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border border-nativz-border px-3 py-1.5',
                'text-xs text-text-secondary hover:text-text-primary hover:bg-surface-hover',
                'transition-colors disabled:opacity-50 disabled:pointer-events-none',
              )}
            >
              <X size={12} />
              {cancel.label ?? 'Cancel'}
            </button>
          )}

          {isEditing && save?.onClick && (
            <button
              type="button"
              onClick={save.onClick}
              disabled={save.disabled || save.loading || save.dirty === false}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5',
                'bg-accent text-[color:var(--accent-contrast)]',
                'hover:bg-accent-hover',
                'text-xs font-semibold',
                'transition-colors disabled:opacity-50 disabled:pointer-events-none',
              )}
            >
              {save.loading ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Check size={12} />
              )}
              {save.label ?? 'Save'}
            </button>
          )}
        </div>
      </header>

      <div className="mt-5 space-y-4">{children}</div>

      {showFooter && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          {footerNote ? (
            <p className="text-xs italic text-text-muted leading-relaxed max-w-[65ch]">
              {footerNote}
            </p>
          ) : (
            <span />
          )}
          {aiGenerate?.onClick && (
            <button
              type="button"
              onClick={aiGenerate.onClick}
              disabled={aiGenerate.disabled || aiGenerate.loading}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border border-accent-text/30 bg-accent-surface',
                'text-accent-text hover:bg-accent-text/10',
                'px-3 py-1.5 text-xs font-medium',
                'transition-colors disabled:opacity-50 disabled:pointer-events-none',
              )}
            >
              {aiGenerate.loading ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Sparkles size={12} />
              )}
              {aiGenerate.label ?? 'Generate with AI'}
            </button>
          )}
        </div>
      )}
    </section>
  );
});

/**
 * A single label + value row used inside InfoCard read views.
 * Matches the screenshot: tiny ALL-CAPS tracked label, primary-colored value
 * underneath, italic muted empty state.
 */
export function InfoField({
  label,
  value,
  isLink,
  mono,
  emptyLabel = 'Not set',
}: {
  label: string;
  value: string | null | undefined;
  /** Render the value as an external link (opens in new tab). */
  isLink?: boolean;
  /** Render the value in the monospace stack (for IDs, handles). */
  mono?: boolean;
  emptyLabel?: string;
}) {
  const has = !!(value && value.trim().length > 0);
  return (
    <div>
      <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
        {label}
      </span>
      {has ? (
        isLink ? (
          <a
            href={value as string}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'mt-1.5 inline-block text-sm text-accent-text hover:underline break-all',
              mono && 'font-mono',
            )}
          >
            {cleanDisplay(value as string)}
          </a>
        ) : (
          <p
            className={cn(
              'mt-1.5 text-sm text-text-primary leading-relaxed',
              mono && 'font-mono',
            )}
          >
            {value}
          </p>
        )
      ) : (
        <p className="mt-1.5 text-sm italic text-text-muted">{emptyLabel}</p>
      )}
    </div>
  );
}

/**
 * Section of read-only fields laid out on a 1–3 column grid above a divider.
 * The divider comes FIRST when used below a card's intro block (matches the
 * screenshot: header block → hairline → meta grid).
 */
export function InfoFieldGrid({
  columns = 3,
  children,
  withDivider = true,
}: {
  columns?: 1 | 2 | 3;
  children: React.ReactNode;
  withDivider?: boolean;
}) {
  return (
    <div
      className={cn(
        withDivider && 'pt-5 border-t border-nativz-border',
        'grid gap-5',
        columns === 1 && 'grid-cols-1',
        columns === 2 && 'grid-cols-1 sm:grid-cols-2',
        columns === 3 && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
      )}
    >
      {children}
    </div>
  );
}

function cleanDisplay(v: string): string {
  return v.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
}
