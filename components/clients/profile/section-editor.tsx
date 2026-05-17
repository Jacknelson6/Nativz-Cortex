'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Pencil, X, Loader2 } from 'lucide-react';

/**
 * SectionEditor:legacy drawer-based editor. New code should reach for
 * InlineSection below; this stays around for one-off "click to expand"
 * cases inside lists.
 */
export function SectionEditor<T extends Record<string, unknown>>({
  label = 'Edit',
  title,
  description,
  initial,
  endpoint,
  method = 'PATCH',
  buildBody,
  validate,
  children,
}: {
  label?: string;
  title: string;
  description?: string;
  initial: T;
  endpoint: string;
  method?: 'PATCH' | 'POST' | 'PUT';
  buildBody?: (draft: T) => Record<string, unknown>;
  validate?: (draft: T) => string | null;
  children: (draft: T, set: (patch: Partial<T>) => void) => ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<T>(initial);
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(initial);
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [open, initial]);

  function setPartial(patch: Partial<T>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  async function handleSave() {
    const err = validate?.(draft);
    if (err) {
      toast.error(err);
      return;
    }
    setSaving(true);
    try {
      const body = buildBody ? buildBody(draft) : (draft as Record<string, unknown>);
      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Save failed (${res.status})`);
      }
      toast.success('Saved');
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-full border border-nativz-border bg-surface px-2.5 py-1 text-[11px] text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors shrink-0"
      >
        <Pencil size={11} />
        {label}
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onCancel={(e) => {
          e.preventDefault();
          setOpen(false);
        }}
        className="m-auto w-[min(560px,calc(100vw-2rem))] rounded-2xl border border-nativz-border bg-surface p-0 text-text-primary backdrop:bg-black/60"
      >
        {open && (
          <div className="flex max-h-[85vh] flex-col">
            <header className="flex items-start justify-between gap-3 border-b border-nativz-border px-5 py-4">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
                {description && (
                  <p className="text-xs text-text-muted mt-1 leading-relaxed">{description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-text-muted hover:text-text-primary hover:bg-surface-hover"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {children(draft, setPartial)}
            </div>
            <footer className="flex items-center justify-end gap-2 border-t border-nativz-border bg-surface-hover/40 px-5 py-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={saving}
                className="rounded-md px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-hover disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60"
              >
                {saving && <Loader2 size={12} className="animate-spin" />}
                Save changes
              </button>
            </footer>
          </div>
        )}
      </dialog>
    </>
  );
}

/**
 * Labelled field used inside SectionEditor / InlineSection. Stacked label-
 * above-input layout:matches Dovetail's settings forms where the label
 * doubles as the field heading.
 */
export function EditorField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <div className="text-[13px] font-medium text-text-primary leading-snug">{label}</div>
      {hint && (
        <div className="text-[12px] text-text-muted leading-relaxed">{hint}</div>
      )}
      <div className="min-w-0 pt-0.5">{children}</div>
    </label>
  );
}

/**
 * Input chrome borrowed from Dovetail: subtle 1px border on a slightly
 * raised surface, generous corner radius, accent ring on focus.
 */
export const editorInputClass =
  'w-full rounded-lg border border-nativz-border/80 bg-background/60 px-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted/60 transition-colors hover:border-nativz-border focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';
export const editorTextareaClass = `${editorInputClass} min-h-[88px] resize-y leading-relaxed`;

/**
 * InlineSection:Dovetail-style settings card. Title + description live
 * INSIDE the card (top, with a hairline divider below). The save footer
 * only appears when the draft diverges from the saved baseline, keeping
 * the chrome quiet while still giving an obvious place to confirm.
 */
export function InlineSection<T extends Record<string, unknown>>({
  title,
  description,
  initial,
  endpoint,
  method = 'PATCH',
  buildBody,
  validate,
  saveLabel = 'Save changes',
  successMessage = 'Saved',
  anchor,
  headerAction,
  children,
}: {
  title: string;
  description?: string;
  initial: T;
  endpoint: string;
  method?: 'PATCH' | 'POST' | 'PUT';
  buildBody?: (draft: T) => Record<string, unknown>;
  validate?: (draft: T) => string | null;
  saveLabel?: string;
  successMessage?: string;
  /** Anchor id so deep links from overview can scroll the section into view. */
  anchor?: string;
  /** Optional right-side header slot, e.g. a status pill or external link. */
  headerAction?: ReactNode;
  children: (draft: T, set: (patch: Partial<T>) => void) => ReactNode;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<T>(initial);
  const [saving, setSaving] = useState(false);
  const initialRef = useRef(initial);

  useEffect(() => {
    initialRef.current = initial;
    setDraft(initial);
  }, [initial]);

  const dirty = useMemo(() => !shallowEqual(draft, initialRef.current), [draft]);

  function setPartial(patch: Partial<T>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  async function handleSave() {
    const err = validate?.(draft);
    if (err) {
      toast.error(err);
      return;
    }
    setSaving(true);
    try {
      const body = buildBody ? buildBody(draft) : (draft as Record<string, unknown>);
      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Save failed (${res.status})`);
      }
      toast.success(successMessage);
      initialRef.current = draft;
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setDraft(initialRef.current);
  }

  return (
    <SectionCard
      title={title}
      description={description}
      anchor={anchor}
      headerAction={headerAction}
      footer={
        dirty ? (
          <SectionFooter
            saving={saving}
            onReset={handleReset}
            onSave={handleSave}
            saveLabel={saveLabel}
          />
        ) : null
      }
    >
      <div className="space-y-5">{children(draft, setPartial)}</div>
    </SectionCard>
  );
}

/**
 * Shared card chrome:title + optional description in a header, divider,
 * then content, then optional footer. Used by InlineSection plus any
 * editor that needs custom save/disconnect logic (UpPromote, social rows)
 * but wants the same visual frame.
 */
export function SectionCard({
  title,
  description,
  anchor,
  headerAction,
  footer,
  bodyClassName,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  anchor?: string;
  headerAction?: ReactNode;
  footer?: ReactNode;
  bodyClassName?: string;
  children: ReactNode;
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
        {headerAction && <div className="shrink-0">{headerAction}</div>}
      </header>
      <div className="border-t border-nativz-border/70" />
      <div className={bodyClassName ?? 'px-5 sm:px-6 py-5'}>{children}</div>
      {footer}
    </section>
  );
}

/**
 * Save / discard footer used by InlineSection and the bespoke editors.
 * Surfaces as a thin sticky-style bar at the bottom of the card.
 */
export function SectionFooter({
  saving,
  onReset,
  onSave,
  saveLabel = 'Save changes',
  leftSlot,
  disabled,
}: {
  saving: boolean;
  onReset?: () => void;
  onSave: () => void;
  saveLabel?: string;
  /** Optional content rendered on the left, e.g. a Disconnect button. */
  leftSlot?: ReactNode;
  /** Disable the save button even though the section is technically dirty. */
  disabled?: boolean;
}) {
  return (
    <footer className="flex items-center justify-between gap-3 border-t border-nativz-border/70 bg-background/40 px-5 sm:px-6 py-3">
      <div className="flex items-center gap-3 min-w-0 text-[12px] text-text-muted">
        {leftSlot ?? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            <span>Unsaved changes</span>
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            disabled={saving}
            className="rounded-full px-3 py-1.5 text-[12px] text-text-muted hover:text-text-primary hover:bg-surface-hover disabled:opacity-50 transition-colors"
          >
            Discard
          </button>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={saving || disabled}
          className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-[12px] font-medium text-white hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving && <Loader2 size={12} className="animate-spin" />}
          {saveLabel}
        </button>
      </div>
    </footer>
  );
}

function shallowEqual<T extends Record<string, unknown>>(a: T, b: T): boolean {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    const av = a[k];
    const bv = b[k];
    if (Array.isArray(av) && Array.isArray(bv)) {
      if (av.length !== bv.length) return false;
      for (let i = 0; i < av.length; i++) {
        if (av[i] !== bv[i]) return false;
      }
      continue;
    }
    if (av !== bv) return false;
  }
  return true;
}
