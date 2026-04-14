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
const SIDEBAR_WIDTH_ICON = '3.5rem';  // 56px
const SIDEBAR_WIDTH_MOBILE = '18rem';
const STORAGE_KEY = 'cortex:sidebar-collapsed';

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
}

export function SidebarProvider({ defaultOpen = true, children }: SidebarProviderProps) {
  const [storedOpen, setStoredOpen] = useState(defaultOpen);
  const [openMobile, setOpenMobile] = useState(false);
  const [forceCollapsed, setForceCollapsedState] = useState(false);
  const pathname = usePathname();

  // Hydrate from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'false') setStoredOpen(false);
    } catch {}
  }, []);

  const setOpen = useCallback((value: boolean) => {
    setStoredOpen(value);
    setForceCollapsedState(false); // user intent overrides forced collapse
    try { localStorage.setItem(STORAGE_KEY, String(value)); } catch {}
  }, []);

  const setForceCollapsed = useCallback((value: boolean) => {
    setForceCollapsedState(value);
  }, []);

  const effectiveOpen = storedOpen && !forceCollapsed;

  const toggleSidebar = useCallback(() => {
    setOpen(!effectiveOpen);
  }, [effectiveOpen, setOpen]);

  // Close mobile on route change
  useEffect(() => {
    setOpenMobile(false);
  }, [pathname]);

  // Keyboard shortcut: cmd+b / ctrl+b
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'b' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggleSidebar();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [toggleSidebar]);

  const state: SidebarState = effectiveOpen ? 'expanded' : 'collapsed';

  return (
    <SidebarContext.Provider value={{ state, open: effectiveOpen, setOpen, openMobile, setOpenMobile, toggleSidebar, forceCollapsed, setForceCollapsed }}>
      <div
        className="flex h-screen w-full overflow-hidden"
        style={{
          '--sidebar-width': SIDEBAR_WIDTH,
          '--sidebar-width-icon': SIDEBAR_WIDTH_ICON,
        } as React.CSSProperties}
      >
        {children}
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
  const { state, open, openMobile, setOpenMobile } = useSidebar();

  /** Same rail as admin — portal and app shell share one visual system */
  const shell = 'border-r border-nativz-border bg-surface';

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        data-state={state}
        data-shell="default"
        suppressHydrationWarning
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

    const layout = open ? 'gap-2.5 px-2.5' : 'justify-center px-0';

    const shellStyles = isActive
      ? 'bg-accent-surface text-text-primary font-semibold'
      : 'text-text-muted hover:bg-surface-hover hover:text-text-primary font-medium';

    return (
      <button
        ref={ref}
        data-active={isActive ? true : undefined}
        suppressHydrationWarning
        className={`relative flex w-full items-center rounded-lg text-[15px] transition-[color,background-color,border-color,box-shadow] duration-150 min-h-[40px] cursor-pointer ${layout} ${shellStyles} ${className}`}
        onMouseEnter={() => !open && setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        {...props}
      >
        {children}

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
