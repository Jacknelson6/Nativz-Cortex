'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  Workflow,
  Camera,
  Scissors,
  ThumbsUp,
  Megaphone,
  Calendar,
  ChevronLeft,
} from 'lucide-react';
import { useSidebar } from './sidebar';

// ---------------------------------------------------------------------------
// Route matcher — which admin routes show the Edits secondary rail
// ---------------------------------------------------------------------------

const EDITS_PREFIXES = [
  '/admin/pipeline',
  '/admin/shoots',
  '/admin/scheduler',
];

export function isAdminEditsRoute(pathname: string): boolean {
  return EDITS_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

interface EditsItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  /** When set, matches /admin/pipeline with this stage query param exactly. */
  stage?: string;
  /** When set, matches /admin/pipeline only when NO stage query param is present. */
  noStage?: boolean;
}

const ITEMS: EditsItem[] = [
  { href: '/admin/pipeline', label: 'All stages', icon: Workflow, noStage: true },
  { href: '/admin/shoots', label: 'Shoot calendar', icon: Camera },
  { href: '/admin/pipeline?stage=editing', label: 'Editing', icon: Scissors, stage: 'editing' },
  { href: '/admin/pipeline?stage=scheduling', label: 'Approvals & handoff', icon: ThumbsUp, stage: 'scheduling' },
  { href: '/admin/pipeline?stage=boosting', label: 'Boosting', icon: Megaphone, stage: 'boosting' },
  { href: '/admin/scheduler', label: 'Calendars', icon: Calendar },
];

function isItemActive(pathname: string, searchStage: string | null, item: EditsItem): boolean {
  // Pipeline items differ by ?stage= value, so check both path and query
  if (item.href.startsWith('/admin/pipeline')) {
    const basePathMatches = pathname === '/admin/pipeline' || pathname.startsWith('/admin/pipeline/');
    if (!basePathMatches) return false;
    if (item.noStage) return !searchStage;
    return searchStage === item.stage;
  }
  return pathname === item.href || pathname.startsWith(item.href + '/');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdminEditsSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchStage = searchParams.get('stage');
  const { setForceCollapsed } = useSidebar();
  const active = isAdminEditsRoute(pathname);

  // Collapse the main rail while inside Edits, matching Settings behavior.
  useEffect(() => {
    setForceCollapsed(active);
    return () => setForceCollapsed(false);
  }, [active, setForceCollapsed]);

  if (!active) return null;

  return (
    <aside
      aria-label="Edits navigation"
      className="sticky top-0 h-screen hidden md:flex flex-col shrink-0 border-r border-nativz-border bg-surface w-56"
    >
      <div className="shrink-0 p-3 pb-2">
        <Link
          href="/admin/dashboard"
          className="inline-flex items-center gap-1 text-[13px] font-medium text-text-muted hover:text-text-secondary transition-colors mb-3"
        >
          <ChevronLeft size={14} />
          <span>Back to dashboard</span>
        </Link>
        <h2 className="px-1 text-lg font-semibold text-text-primary">Edits</h2>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-1">
        <ul className="flex flex-col gap-0.5">
          {ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = isItemActive(pathname, searchStage, item);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-2.5 rounded-lg px-2.5 min-h-[40px] text-[15px] transition-colors ${
                    isActive
                      ? 'bg-accent-surface text-text-primary font-semibold'
                      : 'text-text-muted hover:bg-surface-hover hover:text-text-primary font-medium'
                  }`}
                >
                  <Icon size={18} className="shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
