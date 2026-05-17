'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Pencil, X, Loader2 } from 'lucide-react';

/**
 * SectionEditor — the click target that lives in the WorkspaceSection header
 * and opens an inline editor drawer for the section's fields.
 *
 * Each editor is rendered as a child render-prop that receives the current
 * draft state + a setter. On Save, the editor POSTs the patch JSON to the
 * supplied endpoint and refreshes the route so server-rendered values pick
 * up the change without a full reload.
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
  /** Map the draft state to the actual request body. Defaults to identity. */
  buildBody?: (draft: T) => Record<string, unknown>;
  /** Throw / return a string to block the save with a toast error. */
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
 * Minimal labelled input field used inside SectionEditor drawers.
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
      <div>
        <div className="text-xs font-medium text-text-secondary">{label}</div>
        {hint && <div className="text-[11px] text-text-muted mt-0.5">{hint}</div>}
      </div>
      {children}
    </label>
  );
}

export const editorInputClass =
  'w-full rounded-md border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent';
export const editorTextareaClass = `${editorInputClass} min-h-[88px] resize-y leading-relaxed`;
