'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  FileText,
  Palette,
  Plug,
  ShieldCheck,
  Users,
} from 'lucide-react';
import {
  ClientAdminShellProvider,
  type ClientAdminShellValue,
} from '@/components/clients/client-admin-shell-context';
import { ClientLogo } from '@/components/clients/client-logo';
import { ImpersonateButton } from '@/components/clients/impersonate-button';
import { InviteButton } from '@/components/clients/invite-button';

type NavItem = {
  key: string;
  label: string;
  path: string;
  icon: LucideIcon;
  danger?: boolean;
  /** Render a hairline separator *before* this item. */
  separator?: boolean;
};

// Client area is pure admin/settings — operational features (notes, knowledge,
// ad creatives) live at their own top-level routes. Brand DNA data is folded
// into Brand profile and generated during onboarding in the background.
const NAV: NavItem[] = [
  { key: 'brand', label: 'Brand profile', path: '/settings/brand', icon: Palette },
  { key: 'contacts', label: 'Contacts', path: '/settings/contacts', icon: Users },
  { key: 'integrations', label: 'Integrations', path: '/settings/integrations', icon: Plug },
  { key: 'access', label: 'Access & services', path: '/settings/access', icon: ShieldCheck },
  { key: 'contract', label: 'Contract', path: '/contract', icon: FileText, separator: true },
  { key: 'notifications', label: 'Notifications', path: '/settings/notifications', icon: Bell },
  { key: 'danger', label: 'Archive / delete', path: '/settings/danger', icon: AlertTriangle, danger: true, separator: true },
];

function hrefFor(slug: string, path: string) {
  return `/admin/clients/${slug}${path}`;
}

function isActive(pathname: string | null, slug: string, path: string) {
  if (!pathname) return false;
  const full = hrefFor(slug, path);
  return pathname === full || pathname.startsWith(`${full}/`);
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
        const active = isActive(pathname, slug, item.path);
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
          const active = isActive(pathname, slug, item.path);
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
  const { slug, clientName, clientId, organizationId, logoUrl } = value;

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
          <div className="flex items-start gap-2.5 mb-4 min-w-0">
            <ClientLogo src={logoUrl} name={clientName} size="md" className="mt-0.5" />
            <h1
              className="ui-chrome-title leading-tight min-w-0 flex-1 [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical] overflow-hidden"
              title={clientName}
            >
              {clientName}
            </h1>
          </div>

          {/* Shortcut actions — Invite (with bulk paste/upload + email preview)
              and Impersonate. Previously lived on the Overview dashboard;
              moved into the sidebar so they're reachable from every
              settings subpage without a round-trip. */}
          <div className="mb-4 space-y-2">
            <InviteButton
              clientId={clientId}
              clientName={clientName}
              variant="compact"
            />
            {organizationId && (
              <ImpersonateButton
                organizationId={organizationId}
                clientSlug={slug}
              />
            )}
          </div>

          <SidebarNav slug={slug} />
        </nav>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          {/* Uniform page container — left-aligned to the sidebar with a
              generous admin-cockpit max width. Replaces per-page
              `max-w-5xl mx-auto` wrappers so settings pages use the
              available horizontal space on wide monitors instead of
              floating in a narrow centered reading column. */}
          <div className="max-w-[1440px] px-5 lg:px-8 py-6">
            {children}
          </div>
        </div>
      </div>
    </ClientAdminShellProvider>
  );
}
