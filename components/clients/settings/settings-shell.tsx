'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  Building2,
  Palette,
  Users,
  Plug,
  FolderOpen,
  ShieldCheck,
  Bell,
  AlertTriangle,
} from 'lucide-react';

type SettingsNavItem = {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
};

function buildItems(slug: string): SettingsNavItem[] {
  const base = `/admin/clients/${slug}/settings`;
  return [
    { key: 'general', label: 'General', href: `${base}/general`, icon: Building2 },
    { key: 'brand', label: 'Brand profile', href: `${base}/brand`, icon: Palette },
    { key: 'contacts', label: 'Contacts', href: `${base}/contacts`, icon: Users },
    { key: 'integrations', label: 'Integrations', href: `${base}/integrations`, icon: Plug },
    { key: 'resources', label: 'Resources', href: `${base}/resources`, icon: FolderOpen },
    { key: 'access', label: 'Access & services', href: `${base}/access`, icon: ShieldCheck },
    { key: 'notifications', label: 'Notifications', href: `${base}/notifications`, icon: Bell },
    { key: 'danger', label: 'Archive / delete', href: `${base}/danger`, icon: AlertTriangle },
  ];
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ClientSettingsShell({
  slug,
  children,
}: {
  slug: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? '';
  const items = buildItems(slug);

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      <aside
        aria-label="Client settings navigation"
        className="sticky top-0 hidden md:flex flex-col shrink-0 border-r border-nativz-border bg-surface w-56 h-[calc(100vh-3.5rem)]"
      >
        <div className="shrink-0 p-3 pb-2">
          <h2 className="px-1 text-lg font-semibold text-text-primary">Settings</h2>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-1">
          <ul className="flex flex-col gap-0.5">
            {items.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item.href);
              const danger = item.key === 'danger';
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    className={`flex items-center gap-2.5 rounded-lg px-2.5 min-h-[40px] text-[15px] transition-colors ${
                      active
                        ? danger
                          ? 'bg-red-500/10 text-red-400 font-semibold'
                          : 'bg-accent-surface text-text-primary font-semibold'
                        : danger
                          ? 'text-red-400/80 hover:bg-red-500/10 hover:text-red-400 font-medium'
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

      <main className="flex-1 min-w-0 cortex-page-gutter max-w-4xl mx-auto pb-12 pt-6">
        {children}
      </main>
    </div>
  );
}
