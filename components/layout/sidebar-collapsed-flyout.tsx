'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';

type ChildItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
};

/**
 * Portaled hover flyout for a collapsed-sidebar parent item. We have to
 * portal to document.body because both `Sidebar` and `SidebarContent`
 * carry `overflow-hidden` — any absolute flyout rendered inside the rail
 * gets clipped at the sidebar's right edge.
 *
 * Trigger is the wrapped child (the parent icon button). Hovering either
 * the trigger or the flyout keeps it open, so there's no dead zone while
 * the cursor travels between them.
 */
export function SidebarCollapsedFlyout({
  label,
  items,
  isActive,
  children,
}: {
  label: string;
  items: ChildItem[];
  isActive: (href: string) => boolean;
  children: React.ReactNode;
}) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    function update() {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      // Flyout anchors to the right edge of the trigger icon, slightly
      // down from its top so the popover lines up with the icon's center.
      setCoords({ top: r.top, left: r.right + 8 });
    }
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  function scheduleClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    // Short grace period so moving the cursor from icon → popover
    // doesn't flicker. 120ms is enough to bridge the 8px gap.
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  }
  function cancelClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }

  const popover = open && mounted && coords ? (
    <div
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
      className="fixed z-[1000] min-w-[200px] rounded-lg border border-nativz-border bg-surface shadow-elevated py-1"
      style={{
        top: coords.top,
        left: coords.left,
        backdropFilter: 'blur(16px)',
      }}
    >
      <div className="px-3 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        {label}
      </div>
      <ul className="px-1 pb-0.5">
        {items.map((child) => {
          const active = isActive(child.href);
          const Icon = child.icon;
          return (
            <li key={child.href}>
              <Link
                href={child.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? 'text-accent-text bg-accent-surface'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
                }`}
              >
                <Icon size={14} className="shrink-0" />
                <span className="truncate">{child.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  ) : null;

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={() => {
          cancelClose();
          setOpen(true);
        }}
        onMouseLeave={scheduleClose}
      >
        {children}
      </div>
      {popover && createPortal(popover, document.body)}
    </>
  );
}
