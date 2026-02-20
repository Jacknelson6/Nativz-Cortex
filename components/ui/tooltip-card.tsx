'use client';

import { useState, useRef, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle } from 'lucide-react';

interface TooltipCardProps {
  title: string;
  description: string;
  children: ReactNode;
}

export function TooltipCard({ title, description, children }: TooltipCardProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  const show = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const tooltipWidth = 256;
    const x = rect.left + rect.width / 2 - tooltipWidth / 2;
    const clampedX = Math.max(8, Math.min(x, window.innerWidth - tooltipWidth - 8));
    const y = rect.top - 8;
    setPosition({ x: clampedX, y });
    timeoutRef.current = setTimeout(() => setVisible(true), 200);
  }, []);

  const hide = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setVisible(false);
  }, []);

  return (
    <>
      <span
        onMouseEnter={show}
        onMouseLeave={hide}
        className="inline-flex items-center gap-1 cursor-help"
      >
        {children}
        <HelpCircle size={12} className="text-text-muted/50" />
      </span>
      {visible && typeof document !== 'undefined' && createPortal(
        <div
          className="animate-tooltip-in pointer-events-none fixed z-50 w-64 rounded-lg border border-nativz-border bg-surface p-3 shadow-elevated"
          style={{
            left: position.x,
            bottom: window.innerHeight - position.y,
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
