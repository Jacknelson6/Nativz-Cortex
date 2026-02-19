'use client';

import { useState, useRef, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface TooltipCardProps {
  title: string;
  description: string;
  children: ReactNode;
}

export function TooltipCard({ title, description, children }: TooltipCardProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);

  const show = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.min(rect.left, window.innerWidth - 280);
    const y = rect.bottom + 8;
    const adjustedY = y + 120 > window.innerHeight ? rect.top - 8 : y;
    setPosition({ x: Math.max(8, x), y: adjustedY });

    timeoutRef.current = setTimeout(() => setVisible(true), 200);
  }, []);

  const hide = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setVisible(false);
  }, []);

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        className="cursor-help border-b border-dotted border-text-muted/40"
      >
        {children}
      </span>
      {visible && typeof document !== 'undefined' && createPortal(
        <div
          className="animate-tooltip-in pointer-events-none fixed z-50 w-64 rounded-lg border border-nativz-border bg-surface p-3 shadow-elevated"
          style={{
            left: position.x,
            top: position.y > 0 ? position.y : undefined,
            bottom: position.y <= 0 ? Math.abs(position.y) : undefined,
          }}
        >
          <p className="text-xs font-semibold text-text-primary mb-1">{title}</p>
          <p className="text-xs text-text-muted leading-relaxed">{description}</p>
        </div>,
        document.body
      )}
    </>
  );
}
