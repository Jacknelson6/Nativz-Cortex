'use client';

import { useCallback, useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

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
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    },
    [onCancel],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[color:var(--nz-ink)]/70 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      onKeyDown={handleKeyDown}
    >
      <div className="w-full max-w-sm rounded-xl border border-nativz-border bg-surface p-6 shadow-xl animate-[popIn_200ms_ease-out]">
        {variant === 'danger' && (
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-[color:var(--status-danger)]/15">
            <AlertTriangle size={22} className="text-[color:var(--status-danger)]" />
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
            variant={variant === 'danger' ? 'danger' : 'primary'}
            size="sm"
            className="flex-1"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Hook for easy confirm dialog usage
import { useState } from 'react';

interface UseConfirmOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: 'danger' | 'default';
}

export function useConfirm({ title, description, confirmLabel, variant }: UseConfirmOptions) {
  const [promise, setPromise] = useState<{ resolve: (value: boolean) => void } | null>(null);

  function confirm(): Promise<boolean> {
    return new Promise((resolve) => {
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

  const dialog = (
    <ConfirmDialog
      open={promise !== null}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      variant={variant}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );

  return { confirm, dialog };
}
