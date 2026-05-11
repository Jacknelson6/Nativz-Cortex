// SPY-09 T17: client-only key listener for the present shell. Right
// arrow / space / PageDown advance; Left arrow / PageUp rewind; Esc
// exits to admin detail (internal variant only). Updates URL hash on
// each move so a refresh keeps the rep on the same panel.

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  total: number;
  current: number;
  onChange: (next: number) => void;
  exitHref?: string | null;
}

export function PresentHotkeys({ total, current, onChange, exitHref }: Props) {
  const router = useRouter();

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      // Don't hijack typing in form fields (lead capture panel).
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;

      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        if (current < total - 1) onChange(current + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        if (current > 0) onChange(current - 1);
      } else if (e.key === 'Escape') {
        if (exitHref) {
          e.preventDefault();
          router.push(exitHref);
        }
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [current, total, onChange, exitHref, router]);

  return null;
}
