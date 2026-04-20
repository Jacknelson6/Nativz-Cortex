'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import {
  ArrowLeft,
  BookOpen,
  Building2,
  Dna,
  Image as ImageIcon,
  LayoutDashboard,
  Settings2,
  StickyNote,
} from 'lucide-react';
import {
  ClientAdminShellProvider,
  type ClientAdminShellValue,
} from '@/components/clients/client-admin-shell-context';
import {
  isAdminWorkspaceNavVisible,
  type AdminWorkspaceToggleKey,
} from '@/lib/clients/admin-workspace-modules';

const NAV = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard, path: '' },
  { key: 'brand-dna', label: 'Brand DNA', icon: Dna, path: '/brand-dna' },
  { key: 'moodboard', label: 'Notes', icon: StickyNote, path: '/moodboard' },
  { key: 'knowledge', label: 'Knowledge', icon: BookOpen, path: '/knowledge' },
  { key: 'ad-creatives', label: 'Ad creatives', icon: ImageIcon, path: '/ad-creatives' },
  { key: 'settings', label: 'Settings', icon: Settings2, path: '/settings' },
] as const;

function navHref(slug: string, path: string) {
  return `/admin/clients/${slug}${path}`;
}

function isNavActive(pathname: string | null, slug: string, path: string) {
  if (!pathname) return false;
  const base = `/admin/clients/${slug}`;
  const full = navHref(slug, path);
  if (path === '') {
    return pathname === base || pathname === `${base}/`;
  }
  return pathname === full || pathname.startsWith(`${full}/`);
}

function SidebarNav({
  slug,
  modules,
}: {
  slug: string;
  modules: Record<AdminWorkspaceToggleKey, boolean>;
}) {
  const pathname = usePathname();
  const items = NAV.filter((item) => isAdminWorkspaceNavVisible(modules, item.key));
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const href = navHref(slug, item.path);
        const active = isNavActive(pathname, slug, item.path);
        const Icon = item.icon;
        return (
          <li key={item.key}>
            <Link
              href={href}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? 'bg-accent/10 text-accent-text font-medium'
                  : 'text-text-muted hover:bg-surface-hover hover:text-text-secondary'
              }`}
            >
              <Icon size={15} />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function MobileNav({
  slug,
  modules,
}: {
  slug: string;
  modules: Record<AdminWorkspaceToggleKey, boolean>;
}) {
  const pathname = usePathname();
  const items = NAV.filter((item) => isAdminWorkspaceNavVisible(modules, item.key));
  return (
    <div className="lg:hidden border-b border-nativz-border bg-background px-3 py-2 overflow-x-auto">
      <div className="flex gap-1 min-w-max pb-1">
        {items.map((item) => {
          const href = navHref(slug, item.path);
          const active = isNavActive(pathname, slug, item.path);
          const Icon = item.icon;
          return (
            <Link
              key={item.key}
              href={href}
              className={`inline-flex items-center gap-1.5 shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? 'bg-accent/10 text-accent-text'
                  : 'text-text-muted hover:bg-surface-hover hover:text-text-secondary'
              }`}
            >
              <Icon size={13} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function isClientMoodboardRoute(pathname: string | null, slug: string) {
  if (!pathname) return false;
  const base = `/admin/clients/${slug}/moodboard`;
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function ClientAdminShell({
  value,
  children,
}: {
  value: ClientAdminShellValue;
  children: React.ReactNode;
}) {
  const { slug, clientName, adminWorkspaceModules } = value;
  const pathname = usePathname();
  const moodboardInline = isClientMoodboardRoute(pathname, slug);

  return (
    <ClientAdminShellProvider value={value}>
      <div className="flex h-[calc(100vh-3.5rem)] flex-col lg:flex-row">
        <MobileNav slug={slug} modules={adminWorkspaceModules} />
        <nav className="hidden lg:flex w-56 shrink-0 flex-col border-r border-nativz-border p-4 overflow-y-auto">
          <Link
            href="/admin/clients"
            className="mb-4 inline-flex items-center gap-2 text-xs text-text-muted hover:text-text-secondary transition-colors"
          >
            <ArrowLeft size={14} />
            All clients
          </Link>
          <div className="flex items-center gap-2 mb-1 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-hover border border-nativz-border">
              <Building2 size={16} className="text-accent-text" />
            </div>
            <h1 className="ui-chrome-title truncate" title={clientName}>
              {clientName}
            </h1>
          </div>
          <p className="text-xs text-text-muted mb-4">Client workspace</p>
          <SidebarNav slug={slug} modules={adminWorkspaceModules} />
        </nav>
        <div
          className={cn(
            'min-h-0 min-w-0 flex-1',
            moodboardInline ? 'flex flex-col overflow-hidden' : 'overflow-y-auto',
          )}
        >
          {children}
        </div>
      </div>
    </ClientAdminShellProvider>
  );
}
