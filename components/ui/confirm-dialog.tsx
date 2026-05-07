'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

type ConfirmVariant = 'danger' | 'default' | 'success';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Branded confirm dialog. Renders as a native `<dialog>` so it joins the
 * browser's top-layer — that's the only way to sit above another open
 * `<dialog>` (e.g. `ContentDetailDialog`). z-index can't climb into the
 * top-layer; only opening another `<dialog>.showModal()` after the first
 * stacks above it. See https://html.spec.whatwg.org/multipage/interaction.html#top-layer
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Drive the native dialog imperatively. `showModal()` is what enrolls
  // us in the top-layer; .close() removes us. Calling these on every
  // open transition keeps stacking right when this dialog opens on top
  // of another already-open `<dialog>`.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      confirmRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const handleCancel = useCallback(
    (e: React.SyntheticEvent<HTMLDialogElement>) => {
      // Native ESC dispatches a `cancel` event; intercept so onCancel
      // fires our promise resolver instead of leaving the parent stuck.
      e.preventDefault();
      onCancel();
    },
    [onCancel],
  );

  function handleBackdropMouseDown(e: React.MouseEvent<HTMLDialogElement>) {
    // Native `<dialog>` reports clicks on the backdrop as clicks where
    // e.target === the dialog element itself (the panel sits inside).
    if (e.target === dialogRef.current) onCancel();
  }

  return (
    <dialog
      ref={dialogRef}
      onCancel={handleCancel}
      onMouseDown={handleBackdropMouseDown}
      className="m-auto w-full max-w-sm rounded-xl border border-nativz-border bg-surface p-0 shadow-xl backdrop:bg-[color:var(--nz-ink)]/70 backdrop:backdrop-blur-sm"
    >
      {/*
        stopPropagation on the body: native <dialog> elements keep their
        children in the React virtual tree at the location they're declared.
        When this confirm sits inside a clickable parent (e.g. a client card
        that navigates on click), bubbling button clicks would re-trigger
        the parent's handler. A confirm dialog only ever holds confirm /
        cancel actions, so swallowing bubbling here is always safe.
      */}
      <div
        className="p-6 animate-[popIn_200ms_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {variant === 'danger' && (
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-[color:var(--status-danger)]/15">
            <AlertTriangle size={22} className="text-[color:var(--status-danger)]" />
          </div>
        )}
        {variant === 'success' && (
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-status-success/15">
            <CheckCircle2 size={22} className="text-status-success" />
          </div>
        )}
        <h3 className="text-center text-sm font-semibold text-text-primary">{title}</h3>
        <p className="mt-2 text-center text-xs text-text-muted leading-relaxed">{description}</p>
        <div className="mt-5 flex gap-3">
          <Button variant="outline" size="sm" className="flex-1" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            variant={variant === 'danger' ? 'danger' : variant === 'success' ? 'success' : 'primary'}
            size="sm"
            className="flex-1"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}

interface UseConfirmOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
}

/**
 * Promise-returning confirm hook. Usage:
 *
 *   const { confirm, dialog } = useConfirm({ title: '…', description: '…' });
 *   const ok = await confirm();   // resolves true on Confirm, false otherwise
 *   return <>{dialog}…</>;
 *
 * For dynamic copy (counters, names), pass options that depend on state
 * — they re-bind on each render. Or call `confirm({ title, description })`
 * to override per-call.
 */
export function useConfirm(options: UseConfirmOptions) {
  const [promise, setPromise] = useState<{ resolve: (value: boolean) => void } | null>(null);
  const [overrides, setOverrides] = useState<Partial<UseConfirmOptions> | null>(null);

  function confirm(perCall?: Partial<UseConfirmOptions>): Promise<boolean> {
    return new Promise((resolve) => {
      setOverrides(perCall ?? null);
      setPromise({ resolve });
    });
  }

  function handleConfirm() {
    promise?.resolve(true);
    setPromise(null);
  }

  function handleCancel() {
    promise?.resolve(false);
    setPromise(null);
  }

  const merged = { ...options, ...(overrides ?? {}) };

  const dialog = (
    <ConfirmDialog
      open={promise !== null}
      title={merged.title}
      description={merged.description}
      confirmLabel={merged.confirmLabel}
      cancelLabel={merged.cancelLabel}
      variant={merged.variant}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );

  return { confirm, dialog };
}
