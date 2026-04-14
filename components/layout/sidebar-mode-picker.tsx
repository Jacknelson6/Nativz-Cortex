'use client';

import { useEffect, useRef, useState } from 'react';
import { PanelLeft, PanelLeftClose, MousePointer, Check } from 'lucide-react';
import { useSidebar, type SidebarMode } from './sidebar';

const MODE_OPTIONS: { value: SidebarMode; label: string; icon: React.ComponentType<{ size?: number; className?: string }>; hint: string }[] = [
  { value: 'expanded', label: 'Expanded', icon: PanelLeft, hint: 'Full width always' },
  { value: 'collapsed', label: 'Collapsed', icon: PanelLeftClose, hint: 'Icon rail only' },
  { value: 'hover', label: 'Expand on hover', icon: MousePointer, hint: 'Grows when you hover' },
];

/**
 * Compact button that opens a popover with three sidebar layout options.
 * Replaces the old "Collapse" toggle in the sidebar footer so users can pick
 * between a persistent expanded rail, a persistent icon rail, or a hover-to-
 * expand overlay — no longer a binary.
 */
export function SidebarModePicker() {
  const { open, mode, setMode } = useSidebar();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Click-outside dismiss.
  useEffect(() => {
    if (!popoverOpen) return;
    function onDoc(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
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
  const ActiveIcon = active.icon;

  return (
    <div ref={wrapperRef} className="relative mt-2">
      <button
        type="button"
        onClick={() => setPopoverOpen((v) => !v)}
        aria-label="Sidebar control"
        aria-haspopup="menu"
        aria-expanded={popoverOpen}
        title={`Sidebar: ${active.label}`}
        className={`flex items-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors cursor-pointer ${
          open ? 'w-full gap-2 px-2.5 py-1.5 text-[13px] font-medium' : 'justify-center w-full py-2'
        } ${popoverOpen ? 'bg-surface-hover text-text-secondary' : ''}`}
      >
        <ActiveIcon size={16} className="shrink-0" />
        {open && <span className="truncate">{active.label}</span>}
      </button>

      {popoverOpen && (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-40 mb-2 w-56 rounded-lg border border-nativz-border bg-surface shadow-elevated backdrop-blur animate-[sidebarTooltipIn_120ms_ease-out_forwards]"
        >
          <div className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Sidebar control
          </div>
          <ul className="py-1">
            {MODE_OPTIONS.map((opt) => {
              const Icon = opt.icon;
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
                      selected ? 'bg-accent-surface/40 text-text-primary' : 'text-text-secondary hover:bg-surface-hover'
                    }`}
                  >
                    <Icon size={14} className="shrink-0 text-text-muted" />
                    <span className="flex-1 truncate">{opt.label}</span>
                    {selected ? (
                      <Check size={14} className="shrink-0 text-accent-text" />
                    ) : (
                      <span className="shrink-0 text-[11px] text-text-muted/70">{opt.hint}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
