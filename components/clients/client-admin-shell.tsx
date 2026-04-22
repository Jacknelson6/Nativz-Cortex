'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  FileUser,
  Handshake,
} from 'lucide-react';
import {
  ClientAdminShellProvider,
  type ClientAdminShellValue,
} from '@/components/clients/client-admin-shell-context';
import { ClientLogo } from '@/components/clients/client-logo';
import { ClientIdentityHeader } from '@/components/clients/client-identity-header';

type NavItem = {
  key: string;
  label: string;
  /** Primary route + legacy routes that should still mark this item active. */
  path: string;
  matches?: string[];
  icon: LucideIcon;
  danger?: boolean;
  /** Render a hairline separator *before* this item. */
  separator?: boolean;
};

// Consolidated nav — four items mapped to user mental model:
//   Info         = who the client is        (identity + brand + contacts + integrations)
//   Partnership  = what we do for them       (services + contract)
//   Notifications, Archive/delete stay standalone.
// Onboarding lives under a top-level /admin/onboarding admin tool (not
// per-client), so it's not in this nav.
const NAV: NavItem[] = [
  {
    key: 'info',
    label: 'Info',
    path: '/settings/info',
    matches: ['/settings/brand', '/settings/contacts', '/settings/integrations', '/settings/general'],
    icon: FileUser,
  },
  {
    key: 'partnership',
    label: 'Partnership',
    path: '/settings/partnership',
    matches: ['/settings/access', '/contract'],
    icon: Handshake,
  },
  { key: 'notifications', label: 'Notifications', path: '/settings/notifications', icon: Bell, separator: true },
  { key: 'danger', label: 'Archive / delete', path: '/settings/danger', icon: AlertTriangle, danger: true, separator: true },
];

function hrefFor(slug: string, path: string) {
  return `/admin/clients/${slug}${path}`;
}

function isActive(pathname: string | null, slug: string, path: string, matches?: string[]) {
  if (!pathname) return false;
  const primary = hrefFor(slug, path);
  if (pathname === primary || pathname.startsWith(`${primary}/`)) return true;
  if (matches) {
    for (const m of matches) {
      const legacy = hrefFor(slug, m);
      if (pathname === legacy || pathname.startsWith(`${legacy}/`)) return true;
    }
  }
  return false;
}

function itemClass(active: boolean, danger: boolean | undefined) {
  if (active) {
    return danger
      ? 'bg-red-500/10 text-red-400 font-semibold'
      : 'bg-accent-surface text-text-primary font-semibold';
  }
  return danger
    ? 'text-red-400/80 hover:bg-red-500/10 hover:text-red-400 font-medium'
    : 'text-text-muted hover:bg-surface-hover hover:text-text-primary font-medium';
}

function SidebarNav({ slug }: { slug: string }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-0.5">
      {NAV.map((item) => {
        const href = hrefFor(slug, item.path);
        const active = isActive(pathname, slug, item.path, item.matches);
        const Icon = item.icon;
        return (
          <li key={item.key}>
            {item.separator && (
              <div aria-hidden className="my-2 h-px bg-nativz-border/60 mx-2" />
            )}
            <Link
              href={href}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${itemClass(active, item.danger)}`}
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

function MobileNav({ slug }: { slug: string }) {
  const pathname = usePathname();
  return (
    <div className="lg:hidden border-b border-nativz-border bg-background px-3 py-2 overflow-x-auto">
      <div className="flex gap-1 min-w-max pb-1">
        {NAV.map((item) => {
          const href = hrefFor(slug, item.path);
          const active = isActive(pathname, slug, item.path, item.matches);
          const Icon = item.icon;
          return (
            <Link
              key={item.key}
              href={href}
              className={`inline-flex items-center gap-1.5 shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${itemClass(active, item.danger)}`}
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

export function ClientAdminShell({
  value,
  children,
}: {
  value: ClientAdminShellValue;
  children: React.ReactNode;
}) {
  const { slug, clientName, logoUrl } = value;

  return (
    <ClientAdminShellProvider value={value}>
      <div className="flex h-[calc(100vh-3.5rem)] flex-col lg:flex-row">
        <MobileNav slug={slug} />
        <nav className="hidden lg:flex w-56 shrink-0 flex-col border-r border-nativz-border p-4 overflow-y-auto">
          <Link
            href="/admin/clients"
            className="mb-4 inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            <ArrowLeft size={13} />
            All clients
          </Link>
          <div className="flex items-start gap-2.5 mb-5 min-w-0">
            <ClientLogo src={logoUrl} name={clientName} size="md" className="mt-0.5" />
            <h1
              className="ui-chrome-title leading-tight min-w-0 flex-1 [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical] overflow-hidden"
              title={clientName}
            >
              {clientName}
            </h1>
          </div>

          {/* Invite + Impersonate are now surfaced in the ClientIdentityHeader
              card at the top of every page — see client-identity-header.tsx.
              Keeping the sidebar focused on navigation. */}

          <SidebarNav slug={slug} />
        </nav>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          {/* Uniform page container — left-aligned to the sidebar with a
              generous admin-cockpit max width. Identity header is always
              the first child; each page adds its own rhythm below. */}
          <div className="max-w-[1440px] px-5 lg:px-8 py-6 space-y-6">
            <ClientIdentityHeader />
            {children}
          </div>
        </div>
      </div>
    </ClientAdminShellProvider>
  );
}
