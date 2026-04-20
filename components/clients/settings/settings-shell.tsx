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
import { cn } from '@/lib/utils/cn';

type SettingsNavItem = {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  description?: string;
};

type SettingsNavGroup = {
  label: string;
  items: SettingsNavItem[];
};

function buildGroups(slug: string): SettingsNavGroup[] {
  const base = `/admin/clients/${slug}/settings`;
  return [
    {
      label: 'Account',
      items: [
        { key: 'general', label: 'General', href: `${base}/general`, icon: Building2 },
        { key: 'brand', label: 'Brand profile', href: `${base}/brand`, icon: Palette },
        { key: 'contacts', label: 'Contacts', href: `${base}/contacts`, icon: Users },
      ],
    },
    {
      label: 'Data',
      items: [
        { key: 'integrations', label: 'Integrations', href: `${base}/integrations`, icon: Plug },
        { key: 'resources', label: 'Resources', href: `${base}/resources`, icon: FolderOpen },
      ],
    },
    {
      label: 'Access',
      items: [
        { key: 'access', label: 'Access & services', href: `${base}/access`, icon: ShieldCheck },
        { key: 'notifications', label: 'Notifications', href: `${base}/notifications`, icon: Bell },
      ],
    },
    {
      label: 'Danger',
      items: [
        { key: 'danger', label: 'Archive / delete', href: `${base}/danger`, icon: AlertTriangle },
      ],
    },
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
  const groups = buildGroups(slug);

  return (
    <div className="cortex-page-gutter max-w-6xl mx-auto pb-12">
      <div className="mb-6">
        <h1 className="ui-page-title-md">Settings</h1>
        <p className="text-sm text-text-muted mt-0.5">
          Configure this client&apos;s account, data sources, and access.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Left rail */}
        <aside className="lg:w-56 shrink-0">
          <nav aria-label="Settings sections" className="space-y-5 sticky top-4">
            {groups.map((group) => (
              <div key={group.label}>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1.5 px-2">
                  {group.label}
                </p>
                <ul className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = isActive(pathname, item.href);
                    const Icon = item.icon;
                    const isDanger = item.key === 'danger';
                    return (
                      <li key={item.key}>
                        <Link
                          href={item.href}
                          className={cn(
                            'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors',
                            active
                              ? isDanger
                                ? 'bg-red-500/10 text-red-400 font-medium'
                                : 'bg-accent/10 text-accent-text font-medium'
                              : isDanger
                                ? 'text-red-400/70 hover:bg-red-500/10 hover:text-red-400'
                                : 'text-text-muted hover:bg-surface-hover hover:text-text-secondary',
                          )}
                        >
                          <Icon size={15} />
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
