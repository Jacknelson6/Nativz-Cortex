'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarDays,
  TrendingUp,
  MessagesSquare,
  ClipboardCheck,
  Menu,
} from 'lucide-react';
import { useSidebar } from '@/components/layout/sidebar';

/**
 * Mobile bottom navigation. Renders below `md` (under 768px) so the existing
 * sidebar at `md:flex+` is undisturbed — the breakpoint matches the
 * sidebar primitive's own `hidden md:flex` rule so we keep the tablet+
 * desktop experience identical to today.
 *
 * Tabs are intentionally limited to four brand-scoped destinations + one
 * "More" affordance that opens the sidebar's existing mobile drawer.
 * Brand pill in the top bar drives scoping; the rail is purely about
 * thumb-reachable jumps between the agency's highest-traffic surfaces.
 *
 * Same set of tabs works for admin and viewer roles — none of the four
 * destinations are admin-gated. Drawer reveals everything else.
 */
interface NavTab {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const TABS: NavTab[] = [
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/finder/new', label: 'Finder', icon: TrendingUp },
  { href: '/lab', label: 'Lab', icon: MessagesSquare },
  { href: '/review', label: 'Review', icon: ClipboardCheck },
];

function isTabActive(pathname: string, href: string): boolean {
  // Finder tab matches the whole /finder/* subtree (topic detail,
  // subtopics, processing), but not /finder/formats — that one lives
  // under "More" because it's not in the rail.
  if (href === '/finder/new') {
    if (pathname.startsWith('/finder/formats')) return false;
    return pathname.startsWith('/finder');
  }
  if (href === '/calendar') return pathname.startsWith('/calendar');
  if (href === '/review') return pathname.startsWith('/review');
  if (href === '/lab') return pathname.startsWith('/lab');
  return false;
}

export function MobileBottomNav() {
  const pathname = usePathname();
  const { setOpenMobile, openMobile } = useSidebar();

  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-nativz-border bg-surface/95 backdrop-blur-md"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="grid grid-cols-5">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = isTabActive(pathname, tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                  active
                    ? 'text-accent-text'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                <Icon
                  size={20}
                  className={active ? 'text-accent-text' : 'text-text-muted'}
                />
                <span>{tab.label}</span>
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={() => setOpenMobile(!openMobile)}
            aria-label="Open menu"
            aria-expanded={openMobile}
            className={`flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
              openMobile
                ? 'text-accent-text'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            <Menu
              size={20}
              className={openMobile ? 'text-accent-text' : 'text-text-muted'}
            />
            <span>More</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
