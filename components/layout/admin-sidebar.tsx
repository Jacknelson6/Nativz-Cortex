'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, Search, History } from 'lucide-react';
import { FloatingDock } from '@/components/ui/floating-dock';
import { Button } from '@/components/ui/button';

const DASHBOARD_ITEM = { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard };

const RESEARCH_ITEMS = [
  { href: '/admin/search/history', label: 'Search history', icon: History },
];

const MANAGE_ITEMS = [
  { href: '/admin/clients', label: 'Clients', icon: Users },
];

const ALL_ITEMS = [DASHBOARD_ITEM, ...RESEARCH_ITEMS, ...MANAGE_ITEMS];

function NavLink({ href, label, icon: Icon, isActive }: { href: string; label: string; icon: React.ComponentType<{ size?: number }>; isActive: boolean }) {
  return (
    <Link
      href={href}
      data-label={label}
      className={`nav-item-stable flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-all min-h-[44px] ${
        isActive
          ? 'border-l-[3px] border-accent bg-surface-hover text-text-primary font-semibold'
          : 'border-l-[3px] border-transparent text-text-muted hover:bg-surface-hover hover:text-text-primary font-medium'
      }`}
    >
      <Icon size={18} />
      {label}
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pt-5 pb-1.5 text-[11px] font-semibold text-text-muted tracking-widest uppercase">
      {children}
    </p>
  );
}

export function AdminNavItems() {
  const pathname = usePathname();

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/');
  }

  return (
    <>
      {/* CTA */}
      <Link href="/admin/search/new" className="mb-2">
        <Button shape="pill" className="w-full">
          <Search size={16} />
          New search
        </Button>
      </Link>

      {/* Dashboard */}
      <NavLink
        href={DASHBOARD_ITEM.href}
        label={DASHBOARD_ITEM.label}
        icon={DASHBOARD_ITEM.icon}
        isActive={isActive(DASHBOARD_ITEM.href)}
      />

      {/* Research section */}
      <SectionLabel>Research</SectionLabel>
      {RESEARCH_ITEMS.map((item) => (
        <NavLink
          key={item.href}
          href={item.href}
          label={item.label}
          icon={item.icon}
          isActive={isActive(item.href)}
        />
      ))}

      {/* Manage section */}
      <SectionLabel>Manage</SectionLabel>
      {MANAGE_ITEMS.map((item) => (
        <NavLink
          key={item.href}
          href={item.href}
          label={item.label}
          icon={item.icon}
          isActive={isActive(item.href)}
        />
      ))}
    </>
  );
}

export function AdminSidebar() {
  const pathname = usePathname();

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/');
  }

  const dockItems = ALL_ITEMS.map((item) => ({
    title: item.label,
    icon: <item.icon size={20} />,
    href: item.href,
    isActive: isActive(item.href),
  }));

  return (
    <nav className="hidden md:flex w-56 flex-col border-r border-nativz-border bg-surface">
      {/* Expanded sidebar */}
      <div className="flex flex-1 flex-col gap-0.5 p-3">
        <AdminNavItems />
      </div>

      {/* Floating dock at bottom */}
      <div className="border-t border-nativz-border p-3">
        <FloatingDock items={dockItems} />
      </div>
    </nav>
  );
}
