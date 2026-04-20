'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutGrid,
  Users as UsersIcon,
  Receipt,
  Mail,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Route matcher — /admin/tools and everything under it
// ---------------------------------------------------------------------------

export function isAdminToolsRoute(pathname: string): boolean {
  return pathname === '/admin/tools' || pathname.startsWith('/admin/tools/');
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

interface ToolsItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  exact?: boolean;
}

const ITEMS: ToolsItem[] = [
  { href: '/admin/tools', label: 'Overview', icon: LayoutGrid, exact: true },
  { href: '/admin/tools/users', label: 'Users', icon: UsersIcon },
  { href: '/admin/tools/accounting', label: 'Accounting', icon: Receipt },
  { href: '/admin/tools/email', label: 'Email', icon: Mail },
];

function isItemActive(pathname: string, item: ToolsItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + '/');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdminToolsSidebar() {
  const pathname = usePathname();
  if (!isAdminToolsRoute(pathname)) return null;

  return (
    <aside
      aria-label="Tools navigation"
      className="sticky top-0 h-screen hidden md:flex flex-col shrink-0 border-r border-nativz-border bg-surface w-56"
    >
      <div className="shrink-0 p-3 pb-2">
        <h2 className="px-1 text-lg font-semibold text-text-primary">Tools</h2>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-1">
        <ul className="flex flex-col gap-0.5">
          {ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = isItemActive(pathname, item);
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
