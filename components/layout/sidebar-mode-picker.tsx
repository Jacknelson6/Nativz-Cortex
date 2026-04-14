'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PanelLeft } from 'lucide-react';
import { useSidebar, type SidebarMode } from './sidebar';

// Single icon for all three modes — Supabase pattern. The picker is about
// behavior, not visual variants, so the icon is a constant.
const MODE_OPTIONS: { value: SidebarMode; label: string; hint: string }[] = [
  { value: 'expanded', label: 'Expanded', hint: 'Full width always' },
  { value: 'collapsed', label: 'Collapsed', hint: 'Icon rail only' },
  { value: 'hover', label: 'Expand on hover', hint: 'Grows when you hover' },
];

const POPOVER_WIDTH = 240;

/**
 * Compact button that opens a popover with three sidebar layout options.
 * Popover renders into document.body via a portal so it escapes the
 * sidebar's overflow-hidden and stays visible when the rail is collapsed
 * to the icon-only width.
 */
export function SidebarModePicker() {
  const { open, mode, setMode } = useSidebar();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [position, setPosition] = useState<{ bottom: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { setMounted(true); }, []);

  // Recompute position whenever the popover opens or the viewport changes.
  useLayoutEffect(() => {
    if (!popoverOpen || !buttonRef.current) return;
    function updatePos() {
      const rect = buttonRef.current!.getBoundingClientRect();
      // Anchor via `bottom` so the popover sits above the button regardless
      // of its own rendered height — avoids a collision with the
      // sidebarTooltipIn keyframes, which end on transform: translateX(0)
      // and would otherwise clobber a translateY(-100%).
      setPosition({
        bottom: window.innerHeight - rect.top + 8,
        left: rect.left,
      });
    }
    updatePos();
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    return () => {
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', updatePos, true);
    };
  }, [popoverOpen]);

  // Click-outside + Escape dismiss.
  useEffect(() => {
    if (!popoverOpen) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setPopoverOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPopoverOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [popoverOpen]);

  const active = MODE_OPTIONS.find((o) => o.value === mode) ?? MODE_OPTIONS[0];

  const popover = popoverOpen && position && (
    <div
      ref={popoverRef}
      role="menu"
      className="fixed z-[9999] rounded-lg border border-nativz-border bg-surface shadow-elevated backdrop-blur animate-[sidebarTooltipIn_120ms_ease-out_forwards]"
      style={{
        bottom: position.bottom,
        left: position.left,
        width: POPOVER_WIDTH,
      }}
    >
      <div className="px-3 pt-3 pb-2 text-[11px] font-medium text-text-muted">
        Sidebar control
      </div>
      <ul className="pb-1">
        {MODE_OPTIONS.map((opt) => {
          const selected = mode === opt.value;
          return (
            <li key={opt.value}>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  setMode(opt.value);
                  setPopoverOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors cursor-pointer ${
                  selected ? 'text-text-primary' : 'text-text-secondary hover:bg-surface-hover'
                }`}
                title={opt.hint}
              >
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    selected ? 'bg-text-primary' : 'bg-transparent'
                  }`}
                />
                <span className="whitespace-nowrap">{opt.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <div className={`relative mt-2 flex ${open ? 'justify-start' : 'justify-center'}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setPopoverOpen((v) => !v)}
        aria-label={`Sidebar: ${active.label}`}
        aria-haspopup="menu"
        aria-expanded={popoverOpen}
        title={`Sidebar: ${active.label}`}
        className={`flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors cursor-pointer ${
          popoverOpen ? 'bg-surface-hover text-text-secondary' : ''
        }`}
      >
        <PanelLeft size={15} className="shrink-0" />
      </button>

      {mounted && popover && createPortal(popover, document.body)}
    </div>
  );
}
