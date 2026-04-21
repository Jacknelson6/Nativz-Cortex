'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  forwardRef,
  type ReactNode,
  type HTMLAttributes,
  type ButtonHTMLAttributes,
} from 'react';
import { usePathname } from 'next/navigation';
import { PanelLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SIDEBAR_WIDTH = '15rem';        // 240px
const SIDEBAR_WIDTH_ICON = '3.5rem';  // 56px — legacy, retained so any CSS still referencing --sidebar-width-icon doesn't break
const SIDEBAR_WIDTH_MOBILE = '18rem';

// SidebarMode is kept as a type export for back-compat — nothing else in
// the codebase should be setting it anymore. The only valid value today
// is 'expanded'; the others are retained in the union so stale callers
// that still type-match against the full set compile without churn.
export type SidebarMode = 'expanded' | 'collapsed' | 'hover';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type SidebarState = 'expanded' | 'collapsed';

interface SidebarContextValue {
  state: SidebarState;
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  toggleSidebar: () => void;
  forceCollapsed: boolean;
  setForceCollapsed: (value: boolean) => void;
  mode: SidebarMode;
  setMode: (mode: SidebarMode) => void;
  hovered: boolean;
  setHovered: (hovered: boolean) => void;
}

const SidebarContext = createContext<SidebarContextValue>({
  state: 'expanded',
  open: true,
  setOpen: () => {},
  openMobile: false,
  setOpenMobile: () => {},
  toggleSidebar: () => {},
  forceCollapsed: false,
  setForceCollapsed: () => {},
  mode: 'expanded',
  setMode: () => {},
  hovered: false,
  setHovered: () => {},
});

export function useSidebar() {
  return useContext(SidebarContext);
}

// ---------------------------------------------------------------------------
// SidebarProvider
// ---------------------------------------------------------------------------

interface SidebarProviderProps {
  defaultOpen?: boolean;
  children: ReactNode;
  /**
   * Optional full-width bar that renders above the sidebar + inset row.
   * When provided, the provider's inner wrapper switches from a single
   * flex-row to a flex-col (topBar on top, sidebar+inset below). Portal
   * layouts that don't need a top bar can omit this and get the original
   * row layout.
   */
  topBar?: ReactNode;
}

export function SidebarProvider({ children, topBar }: SidebarProviderProps) {
  // Sidebar is permanently expanded — the collapse / hover-expand modes
  // added more surface area than they paid back in UX. Kept the context
  // surface (open, setOpen, toggleSidebar, mode, setMode, hovered,
  // setHovered, forceCollapsed, setForceCollapsed) as no-ops so callers
  // that haven't been migrated yet don't crash. Mobile drawer stays real.
  const [openMobile, setOpenMobile] = useState(false);
  const pathname = usePathname();

  const setOpen = useCallback((_value: boolean) => {
    /* no-op — sidebar is permanently expanded */
  }, []);
  const setMode = useCallback((_next: SidebarMode) => {
    /* no-op — mode is locked to 'expanded' */
  }, []);
  const toggleSidebar = useCallback(() => {
    /* no-op — nothing to toggle */
  }, []);
  const setForceCollapsed = useCallback((_value: boolean) => {
    /* no-op — retained for back-compat with secondary rails */
  }, []);
  const setHovered = useCallback((_v: boolean) => {
    /* no-op — hover mode is gone */
  }, []);

  // Close mobile on route change
  useEffect(() => {
    setOpenMobile(false);
  }, [pathname]);

  const effectiveOpen = true;
  const state: SidebarState = 'expanded';
  const mode: SidebarMode = 'expanded';
  const forceCollapsed = false;
  const hovered = false;

  return (
    <SidebarContext.Provider
      value={{
        state,
        open: effectiveOpen,
        setOpen,
        openMobile,
        setOpenMobile,
        toggleSidebar,
        forceCollapsed,
        setForceCollapsed,
        mode,
        setMode,
        hovered,
        setHovered,
      }}
    >
      <div
        className={cn(
          'h-screen w-full overflow-hidden',
          topBar ? 'flex flex-col' : 'flex',
        )}
        style={{
          '--sidebar-width': SIDEBAR_WIDTH,
          '--sidebar-width-icon': SIDEBAR_WIDTH_ICON,
        } as React.CSSProperties}
      >
        {topBar}
        {topBar ? (
          <div className="flex min-h-0 flex-1">{children}</div>
        ) : (
          children
        )}
      </div>
    </SidebarContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

interface SidebarProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  children: ReactNode;
}

export function Sidebar({ children, className = '', ...props }: SidebarProps) {
  const { state, open, openMobile, setOpenMobile, mode, setHovered } = useSidebar();

  /** Same rail as admin — portal and app shell share one visual system */
  const shell = 'border-r border-nativz-border bg-surface';

  const isHoverMode = mode === 'hover';

  // Hover mode pushes content like a normal click-toggle — same flex
  // physics, just driven by mouseenter/leave instead of a button click.
  // The width transition lives on the aside so the inset reflows smoothly.
  return (
    <>
      {/* Desktop sidebar */}
      <aside
        data-state={state}
        data-shell="default"
        data-mode={mode}
        suppressHydrationWarning
        onMouseEnter={isHoverMode ? () => setHovered(true) : undefined}
        onMouseLeave={isHoverMode ? () => setHovered(false) : undefined}
        className={`sticky top-0 h-screen hidden md:flex flex-col shrink-0 transition-[width] duration-200 ease-out overflow-hidden ${shell} ${className}`}
        style={{ width: open ? 'var(--sidebar-width)' : 'var(--sidebar-width-icon)' }}
        {...props}
      >
        {children}
      </aside>

      {/* Mobile overlay */}
      <div className="md:hidden">
        {openMobile && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/60 animate-[sidebarOverlayIn_200ms_ease-out_forwards]"
              onClick={() => setOpenMobile(false)}
            />
            <aside
              className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r shadow-elevated animate-[slideInLeft_200ms_cubic-bezier(0.16,1,0.3,1)_forwards] ${shell}`}
              style={{ width: SIDEBAR_WIDTH_MOBILE }}
            >
              {children}
            </aside>
          </>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// SidebarHeader / SidebarFooter / SidebarContent
// ---------------------------------------------------------------------------

export function SidebarHeader({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('shrink-0 p-3', className)}>
      {children}
    </div>
  );
}

export function SidebarFooter({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('shrink-0 border-t border-nativz-border p-3', className)}>
      {children}
    </div>
  );
}

export function SidebarContent({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex-1 overflow-y-auto overflow-x-hidden px-3 py-1', className)}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SidebarGroup / SidebarGroupLabel
// ---------------------------------------------------------------------------

export function SidebarGroup({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`mb-2 ${className}`}>
      {children}
    </div>
  );
}

export function SidebarGroupLabel({ children, className = '' }: { children: ReactNode; className?: string }) {
  const { open } = useSidebar();

  if (!open) return null;

  return (
    <div className={`px-2 py-1.5 text-[13px] font-semibold uppercase tracking-wider text-text-muted ${className}`}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SidebarMenu / SidebarMenuItem
// ---------------------------------------------------------------------------

export function SidebarMenu({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-0.5 ${className}`}>
      {children}
    </div>
  );
}

export function SidebarMenuItem({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SidebarMenuButton — the main nav link/button
// ---------------------------------------------------------------------------

interface SidebarMenuButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  isActive?: boolean;
  tooltip?: string;
  asChild?: boolean;
}

export const SidebarMenuButton = forwardRef<HTMLButtonElement, SidebarMenuButtonProps>(
  ({ children, isActive, tooltip, className = '', ...props }, ref) => {
    const { open } = useSidebar();
    const [showTooltip, setShowTooltip] = useState(false);

    // Click area is the full row; the visible "active pill" lives on an
    // inner span sized to its content. So when the rail is collapsed the
    // pill is icon-sized (looks square). When the rail is expanded, the
    // text fades in and the pill grows around icon + text. Icon's x-
    // position never changes — Supabase-style reveal.
    return (
      <button
        ref={ref}
        data-active={isActive ? true : undefined}
        suppressHydrationWarning
        className={`relative flex w-full items-center min-h-[40px] cursor-pointer text-[15px] ${className}`}
        onMouseEnter={() => !open && setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        {...props}
      >
        <span
          className={`flex items-center rounded-md px-2 py-1.5 transition-colors duration-150 ${
            open ? 'w-full' : ''
          } ${
            isActive
              ? 'bg-accent-surface text-text-primary font-semibold'
              : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary font-medium'
          }`}
        >
          {children}
        </span>

        {/* Collapsed tooltip */}
        {!open && showTooltip && tooltip && (
          <div
            className="absolute left-full ml-2.5 z-[60] rounded-lg bg-surface border border-nativz-border px-2.5 py-1.5 text-xs font-medium text-text-primary shadow-dropdown whitespace-nowrap pointer-events-none animate-[sidebarTooltipIn_120ms_ease-out_forwards]"
          >
            {tooltip}
          </div>
        )}
      </button>
    );
  }
);

SidebarMenuButton.displayName = 'SidebarMenuButton';

// ---------------------------------------------------------------------------
// SidebarSeparator
// ---------------------------------------------------------------------------

export function SidebarSeparator({ className = '' }: { className?: string }) {
  return <div className={cn('my-2 h-px bg-nativz-border', className)} />;
}

// ---------------------------------------------------------------------------
// SidebarRail — thin hover strip to toggle sidebar
// ---------------------------------------------------------------------------

export function SidebarRail() {
  const { toggleSidebar } = useSidebar();

  return (
    <button
      onClick={toggleSidebar}
      className="hidden md:block absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-accent/30 transition-colors z-10"
      aria-label="Toggle sidebar"
    />
  );
}

// ---------------------------------------------------------------------------
// SidebarTrigger — toggle button (usually in header)
// ---------------------------------------------------------------------------

export function SidebarTrigger({ className = '' }: { className?: string }) {
  const { toggleSidebar, setOpenMobile, openMobile } = useSidebar();

  return (
    <>
      {/* Desktop */}
      <button
        onClick={toggleSidebar}
        className={`hidden md:flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors cursor-pointer ${className}`}
        aria-label="Toggle sidebar"
      >
        <PanelLeft size={16} />
      </button>

      {/* Mobile */}
      <button
        onClick={() => setOpenMobile(!openMobile)}
        className={`flex md:hidden h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors cursor-pointer ${className}`}
        aria-label="Toggle menu"
      >
        <PanelLeft size={16} />
      </button>
    </>
  );
}

// ---------------------------------------------------------------------------
// SidebarInset — main content area next to sidebar
// ---------------------------------------------------------------------------

export function SidebarInset({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <main
      className={cn(
        'cortex-main flex-1 min-w-0 overflow-x-hidden overflow-y-auto bg-background',
        className,
      )}
    >
      {children}
    </main>
  );
}
