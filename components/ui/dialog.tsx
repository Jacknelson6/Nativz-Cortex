'use client';

import { useEffect, useRef, ReactNode } from 'react';
import { X } from 'lucide-react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** Omit or pass empty string for a close-only chrome (e.g. full-height wizards). */
  title?: string;
  children: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '5xl' | '6xl' | '7xl' | 'full';
  /** Extra classes on the `<dialog>` element (e.g. max height). */
  className?: string;
  /** Override padding wrapper around children (default `p-6`). */
  bodyClassName?: string;
  /** Fires when user attempts to ESC. Call `e.preventDefault()` to keep open. */
  onCancel?: (e: React.SyntheticEvent<HTMLDialogElement>) => void;
}

const maxWidthStyles = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
  '7xl': 'max-w-7xl',
  full: 'max-w-[calc(100vw-4rem)] max-h-[calc(100vh-4rem)]',
};

export function Dialog({
  open,
  onClose,
  title = '',
  children,
  maxWidth = 'md',
  className = '',
  bodyClassName,
  onCancel,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      dialog.showModal();
      document.body.style.overflow = 'hidden';
    } else {
      dialog.close();
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={onCancel}
      onClick={handleBackdropClick}
      className={`${maxWidthStyles[maxWidth]} w-full m-auto rounded-xl border border-nativz-border bg-surface p-0 shadow-elevated backdrop:bg-[color:var(--nz-ink)]/70 backdrop:backdrop-blur-sm relative ${className}`.trim()}
    >
      <div className={bodyClassName ?? 'p-6'}>
        {title ? (
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
            <button
              onClick={onClose}
              className="cursor-pointer rounded-lg p-1 text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors"
              aria-label="Close dialog"
            >
              <X size={20} />
            </button>
          </div>
        ) : (
          <button
            onClick={onClose}
            className="cursor-pointer absolute top-4 right-4 z-10 rounded-lg p-1 text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors"
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        )}
        {children}
      </div>
    </dialog>
  );
}
