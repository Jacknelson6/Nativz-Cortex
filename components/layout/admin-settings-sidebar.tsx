'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Users,
  Brain,
  Cpu,
  Code,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Route matcher — which admin routes show the Settings secondary rail
// ---------------------------------------------------------------------------

const SETTINGS_PREFIXES = [
  // Account settings lives under /admin/settings and is reached only via the
  // avatar popover — intentionally excluded so the secondary settings rail
  // doesn't double up with the account page's own sub-nav.
  '/admin/settings/ai',
  '/admin/users',
  '/admin/knowledge',
];

export function isAdminSettingsRoute(pathname: string): boolean {
  if (pathname === '/admin/nerd/api' || pathname.startsWith('/admin/nerd/api/')) return true;
  return SETTINGS_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

interface SettingsItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  /** When href is a prefix of other items (e.g. /admin/settings is the prefix
   *  of /admin/settings/usage), use exact match instead of startsWith. */
  exact?: boolean;
}

const ITEMS: SettingsItem[] = [
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/knowledge', label: 'Brain', icon: Brain },
  { href: '/admin/settings/ai', label: 'AI settings', icon: Cpu },
  { href: '/admin/nerd/api', label: 'API docs', icon: Code },
];

function isItemActive(pathname: string, item: SettingsItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + '/');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdminSettingsSidebar() {
  const pathname = usePathname();
  const active = isAdminSettingsRoute(pathname);

  if (!active) return null;

  return (
    <aside
      aria-label="Settings navigation"
      className="sticky top-0 h-screen hidden md:flex flex-col shrink-0 border-r border-nativz-border bg-surface w-56"
    >
      <div className="shrink-0 p-3 pb-2">
        <h2 className="px-1 text-lg font-semibold text-text-primary">Settings</h2>
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
