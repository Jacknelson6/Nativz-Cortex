'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Search, FileText, Settings } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/portal/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/portal/search/new', label: 'New search', icon: Search },
  { href: '/portal/reports', label: 'Reports', icon: FileText },
  { href: '/portal/settings', label: 'Settings', icon: Settings },
];

export function PortalNavItems() {
  const pathname = usePathname();

  return (
    <>
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors min-h-[44px] ${
              isActive
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Icon size={18} />
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

export function PortalSidebar() {
  return (
    <nav className="hidden md:flex w-56 flex-col border-r border-gray-200 bg-white">
      <div className="flex flex-1 flex-col gap-1 p-3">
        <PortalNavItems />
      </div>
    </nav>
  );
}
