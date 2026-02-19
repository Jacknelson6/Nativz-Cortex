'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Search, FileText, Settings } from 'lucide-react';
import { FloatingDock } from '@/components/ui/floating-dock';
import { Button } from '@/components/ui/button';

const DASHBOARD_ITEM = { href: '/portal/dashboard', label: 'Dashboard', icon: LayoutDashboard };

const RESEARCH_ITEMS = [
  { href: '/portal/reports', label: 'Reports', icon: FileText },
];

const ACCOUNT_ITEMS = [
  { href: '/portal/settings', label: 'Settings', icon: Settings },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pt-5 pb-1.5 text-[11px] font-semibold text-text-muted tracking-widest uppercase">
      {children}
    </p>
  );
}

export function PortalNavItems() {
  const pathname = usePathname();

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/');
  }

  const dashboardDock = [{
    title: DASHBOARD_ITEM.label,
    icon: <DASHBOARD_ITEM.icon size={18} />,
    href: DASHBOARD_ITEM.href,
    isActive: isActive(DASHBOARD_ITEM.href),
  }];

  const researchDock = RESEARCH_ITEMS.map((item) => ({
    title: item.label,
    icon: <item.icon size={18} />,
    href: item.href,
    isActive: isActive(item.href),
  }));

  const accountDock = ACCOUNT_ITEMS.map((item) => ({
    title: item.label,
    icon: <item.icon size={18} />,
    href: item.href,
    isActive: isActive(item.href),
  }));

  return (
    <>
      {/* CTA */}
      <Link href="/portal/search/new" className="mb-2">
        <Button shape="pill" className="w-full">
          <Search size={16} />
          New search
        </Button>
      </Link>

      {/* Dashboard */}
      <FloatingDock items={dashboardDock} />

      {/* Research section */}
      <SectionLabel>Research</SectionLabel>
      <FloatingDock items={researchDock} />

      {/* Account section */}
      <SectionLabel>Account</SectionLabel>
      <FloatingDock items={accountDock} />
    </>
  );
}

export function PortalSidebar() {
  return (
    <nav className="hidden md:flex w-56 flex-col border-r border-nativz-border bg-surface">
      <div className="flex flex-1 flex-col gap-0.5 p-3">
        <PortalNavItems />
      </div>
    </nav>
  );
}
