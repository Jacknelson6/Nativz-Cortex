'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Users, Search, History, LogOut, Settings, User } from 'lucide-react';
import { FloatingDock } from '@/components/ui/floating-dock';
import { Button } from '@/components/ui/button';

const NAV_ITEMS = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/search/history', label: 'Search history', icon: History },
  { href: '/admin/clients', label: 'Clients', icon: Users },
];

export function AdminNavItems() {
  const pathname = usePathname();

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/');
  }

  const dockItems = NAV_ITEMS.map((item) => ({
    title: item.label,
    icon: <item.icon size={18} />,
    href: item.href,
    isActive: isActive(item.href),
  }));

  return (
    <>
      {/* CTA */}
      <Link href="/admin/search/new" className="mb-2">
        <Button shape="pill" className="w-full">
          <Search size={16} />
          New search
        </Button>
      </Link>

      {/* Navigation */}
      <FloatingDock items={dockItems} />
    </>
  );
}

interface AdminSidebarProps {
  userName?: string;
}

export function AdminSidebar({ userName }: AdminSidebarProps) {
  return (
    <nav className="hidden md:flex w-56 flex-col border-r border-nativz-border bg-surface">
      <div className="flex flex-1 flex-col gap-0.5 p-3">
        <AdminNavItems />
      </div>
      <SidebarAccount userName={userName} />
    </nav>
  );
}

function SidebarAccount({ userName }: { userName?: string }) {
  const router = useRouter();

  async function handleLogout() {
    const res = await fetch('/api/auth/logout', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    router.push(data.redirectTo || '/admin/login');
    router.refresh();
  }

  return (
    <div className="border-t border-nativz-border p-3">
      <div className="flex items-center gap-2.5">
        <Link
          href="/admin/settings"
          className="flex flex-1 items-center gap-2.5 min-w-0 rounded-lg p-1 -m-1 hover:bg-surface-hover transition-colors"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-surface">
            <User size={14} className="text-accent-text" />
          </div>
          <div className="flex-1 min-w-0">
            {userName && (
              <p className="truncate text-sm font-medium text-text-primary">{userName}</p>
            )}
            <p className="text-xs text-text-muted">Account settings</p>
          </div>
          <Settings size={14} className="shrink-0 text-text-muted" />
        </Link>
        <button
          onClick={handleLogout}
          className="shrink-0 rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors"
          title="Sign out"
        >
          <LogOut size={16} />
        </button>
      </div>
    </div>
  );
}
