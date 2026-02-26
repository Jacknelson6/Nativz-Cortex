'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Search, FileText, Settings, Palette, Lightbulb } from 'lucide-react';
import { FloatingDock } from '@/components/ui/floating-dock';
import { Button } from '@/components/ui/button';
import { SidebarAccount } from '@/components/layout/sidebar-account';
import type { FeatureFlags } from '@/lib/portal/get-portal-client';

interface PortalNavItemsProps {
  featureFlags?: FeatureFlags;
}

const ALL_NAV_ITEMS = [
  { href: '/portal/dashboard', label: 'Dashboard', icon: LayoutDashboard, flag: null },
  { href: '/portal/reports', label: 'Reports', icon: FileText, flag: 'can_view_reports' as const },
  { href: '/portal/preferences', label: 'Preferences', icon: Palette, flag: null },
  { href: '/portal/ideas', label: 'Ideas', icon: Lightbulb, flag: null },
  { href: '/portal/settings', label: 'Settings', icon: Settings, flag: null },
];

export function PortalNavItems({ featureFlags }: PortalNavItemsProps) {
  const pathname = usePathname();

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/');
  }

  const navItems = ALL_NAV_ITEMS.filter((item) => {
    if (!item.flag) return true;
    return featureFlags?.[item.flag] !== false;
  });

  const dockItems = navItems.map((item) => ({
    title: item.label,
    icon: <item.icon size={18} />,
    href: item.href,
    isActive: isActive(item.href),
  }));

  const canSearch = featureFlags?.can_search !== false;

  return (
    <>
      {/* CTA */}
      {canSearch && (
        <Link href="/portal/search/new" className="mb-2">
          <Button shape="pill" className="w-full">
            <Search size={16} />
            New search
          </Button>
        </Link>
      )}

      {/* Navigation */}
      <FloatingDock items={dockItems} />
    </>
  );
}

interface PortalSidebarProps {
  userName?: string;
  avatarUrl?: string | null;
  featureFlags?: FeatureFlags;
}

export function PortalSidebar({ userName, avatarUrl, featureFlags }: PortalSidebarProps) {
  return (
    <nav className="hidden md:flex w-56 flex-col border-r border-nativz-border bg-surface">
      <div className="flex flex-1 flex-col gap-0.5 p-3">
        <PortalNavItems featureFlags={featureFlags} />
      </div>
      <SidebarAccount
        userName={userName}
        avatarUrl={avatarUrl}
        settingsHref="/portal/settings"
        logoutRedirect="/portal/login"
      />
    </nav>
  );
}
