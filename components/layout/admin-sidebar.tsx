'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, Search, History, Camera, BarChart3 } from 'lucide-react';
import { FloatingDock } from '@/components/ui/floating-dock';
import { Button } from '@/components/ui/button';
import { SidebarAccount } from '@/components/layout/sidebar-account';

const NAV_ITEMS = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/search/history', label: 'Search history', icon: History },
  { href: '/admin/shoots', label: 'Shoots', icon: Camera },
  { href: '/admin/clients', label: 'Clients', icon: Users },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
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
  avatarUrl?: string | null;
}

export function AdminSidebar({ userName, avatarUrl }: AdminSidebarProps) {
  return (
    <nav className="hidden md:flex w-56 flex-col border-r border-nativz-border bg-surface">
      <div className="flex flex-1 flex-col gap-0.5 p-3">
        <AdminNavItems />
      </div>
      <SidebarAccount
        userName={userName}
        avatarUrl={avatarUrl}
        settingsHref="/admin/settings"
        logoutRedirect="/admin/login"
      />
    </nav>
  );
}
