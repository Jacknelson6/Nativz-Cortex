'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Search,
  BarChart3,
  CheckSquare,
  Send,
  BotMessageSquare,
  ChevronRight,
  Contact,
  ImagePlus,
  StickyNote,
  Scissors,
  Compass,
  ClipboardCheck,
  Settings as SettingsIcon,
} from 'lucide-react';
import { SidebarAccount } from '@/components/layout/sidebar-account';
import { SidebarModePicker } from '@/components/layout/sidebar-mode-picker';
import { BrandSwitcher } from '@/components/portal/brand-switcher';
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarSeparator,
  useSidebar,
} from './sidebar';

// ---------------------------------------------------------------------------
// Nav config
// ---------------------------------------------------------------------------

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  children?: { href: string; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[];
  /** When true, item is grayed out and non-clickable with "Coming soon" tooltip */
  comingSoon?: boolean;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Dashboard',
    items: [
      { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { href: '/admin/search/new', label: 'Topic Search', icon: Search },
      { href: '/admin/analyze-social', label: 'Analyze Social', icon: ClipboardCheck },
    ],
  },
  {
    label: 'Create',
    items: [
      { href: '/admin/strategy-lab', label: 'Content Lab', icon: Compass },
      { href: '/admin/ad-creatives', label: 'Ad Generator', icon: ImagePlus },
      { href: '/admin/notes', label: 'Notes', icon: StickyNote },
    ],
  },
  {
    label: 'Manage',
    items: [
      { href: '/admin/clients', label: 'Clients', icon: Contact },
      { href: '/admin/pipeline', label: 'Edits', icon: Scissors },
      { href: '/admin/tasks', label: 'Tasks', icon: CheckSquare },
      { href: '/admin/settings', label: 'Settings', icon: SettingsIcon },
    ],
  },
];

function isActivePath(pathname: string, href: string, searchParams?: URLSearchParams) {
  // Research — match /search/*
  if (href.endsWith('/search/new')) {
    const prefix = href.replace('/search/new', '/search');
    return pathname.startsWith(prefix);
  }

  // Pipeline root "All stages" shares /admin/pipeline with ?stage=… filtered views
  if (href === '/admin/pipeline' && pathname === '/admin/pipeline') {
    return !searchParams?.get('stage');
  }

  // Knowledge: graph and meetings are one area (single sidebar item)
  if (href.endsWith('/knowledge')) {
    const prefix = href.replace('/knowledge', '');
    if (pathname === `${prefix}/meetings` || pathname.startsWith(`${prefix}/meetings/`)) return true;
    return pathname === href || pathname.startsWith(href + '/');
  }

  // Handle hrefs with query params (e.g. /admin/pipeline?stage=editing)
  if (href.includes('?')) {
    const [hrefPath, hrefQuery] = href.split('?');
    if (pathname !== hrefPath && !pathname.startsWith(hrefPath + '/')) return false;
    if (!searchParams) return false;
    const params = new URLSearchParams(hrefQuery);
    for (const [key, value] of params) {
      if (searchParams.get(key) !== value) return false;
    }
    return true;
  }

  return pathname === href || pathname.startsWith(href + '/');
}

// ---------------------------------------------------------------------------
// AdminSidebar
// ---------------------------------------------------------------------------

/** Items completely hidden from portal (viewer) users */
const ADMIN_ONLY_HREFS = new Set([
  '/admin/dashboard',
  '/admin/tasks',
  '/admin/pipeline',
  '/admin/scheduler',
  '/admin/ad-creatives',
  '/admin/clients',
  '/admin/users',
  '/admin/presentations',
  '/admin/shoots',
  '/admin/knowledge',
  '/admin/analyze-social',
]);

/** Items shown but grayed out with "Coming soon" tooltip for viewers */
const COMING_SOON_HREFS = new Set([
  '/admin/analytics',
]);

/**
 * One-off href rewrites for portal viewers. Used when the portal route
 * doesn't share the admin path suffix (e.g. admin's /strategy-lab maps
 * to portal's /content-lab). Keyed on the admin href so the lookup
 * lines up with NAV_SECTIONS.
 */
const PORTAL_HREF_REWRITES: Record<string, string> = {
  '/admin/strategy-lab': '/portal/content-lab',
};

function getNavSectionsForRole(role: 'admin' | 'viewer', prefix: string): NavSection[] {
  if (role === 'admin') return NAV_SECTIONS;

  // Portal viewers get a filtered flat list
  const viewerItems: NavItem[] = [];
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (ADMIN_ONLY_HREFS.has(item.href)) continue;
      const isComingSoon = COMING_SOON_HREFS.has(item.href);
      const portalRewrite = PORTAL_HREF_REWRITES[item.href];
      // Remap /admin/ → portal prefix (with per-item override for paths
      // that don't share the admin suffix, e.g. strategy-lab → content-lab)
      const remapped: NavItem = {
        ...item,
        href: isComingSoon
          ? '#'
          : (portalRewrite ?? item.href.replace('/admin/', `${prefix}/`)),
        comingSoon: isComingSoon,
        children: isComingSoon ? undefined : item.children?.filter(c => !ADMIN_ONLY_HREFS.has(c.href)).map(c => ({
          ...c,
          href: PORTAL_HREF_REWRITES[c.href] ?? c.href.replace('/admin/', `${prefix}/`),
        })),
      };
      viewerItems.push(remapped);

      // History rail replaces the old "Search history" sidebar item
    }
  }

  return [{ label: '', items: viewerItems }];
}

interface PortalBrand {
  id: string;
  name: string;
  slug: string;
  agency: string | null;
  logo_url: string | null;
  organization_id: string;
}

interface AdminSidebarProps {
  userName?: string;
  avatarUrl?: string | null;
  /** 'admin' shows all nav items, 'viewer' hides admin-only items */
  role?: 'admin' | 'viewer';
  /** Route prefix for links — '/admin' or '/portal' */
  routePrefix?: string;
  /** Login page to redirect to on logout */
  logoutPath?: string;
  /** Settings page path */
  settingsPath?: string;
  /** Portal multi-brand: list of accessible brands */
  brands?: PortalBrand[];
  /** Portal multi-brand: currently active brand ID */
  activeBrandId?: string | null;
}

export function AdminSidebar({
  userName,
  avatarUrl,
  role = 'admin',
  routePrefix = '/admin',
  logoutPath = '/admin/login',
  settingsPath = '/admin/settings',
  brands,
  activeBrandId,
}: AdminSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { open } = useSidebar();
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set());

  function toggleMenu(href: string) {
    setExpandedMenus((prev) => {
      const next = new Set(prev);
      if (next.has(href)) next.delete(href);
      else next.add(href);
      return next;
    });
  }

  return (
    <Sidebar>
      {/* Logo moved to <AgencyLogo /> at the admin-layout level (top-left
          of the viewport). Sidebar header reserves vertical room for that
          fixed logo so nav items don't collide with it. */}
      <SidebarHeader className="pt-16">
        {role === 'viewer' && brands && brands.length > 1 && activeBrandId && (
          <div className="mb-1">
            <BrandSwitcher activeBrandId={activeBrandId} brands={brands} collapsed={!open} />
          </div>
        )}
      </SidebarHeader>

      {/* Navigation */}
      <SidebarContent>
        {getNavSectionsForRole(role, routePrefix).map((section, idx) => (
          <SidebarGroup key={section.label}>
            {open && (
              <span className="px-2.5 pb-1 text-[13px] font-semibold uppercase tracking-wide text-text-muted">
                {section.label}
              </span>
            )}
            {!open && idx > 0 && <SidebarSeparator />}
            <SidebarMenu>
              {section.items.map((item) => {
                const active = isActivePath(pathname, item.href, searchParams);

                if (item.children && open) {
                  const childActive = item.children.some((c) => isActivePath(pathname, c.href, searchParams));
                  const isExpanded = childActive || active || expandedMenus.has(item.href);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton isActive={active || childActive} tooltip={item.label} onClick={() => {
                        // Navigate to the parent (all stages) and expand children
                        router.push(item.href);
                        if (!isExpanded) toggleMenu(item.href);
                      }}>
                        <item.icon size={18} className="shrink-0" />
                        <span className="truncate">{item.label}</span>
                        <ChevronRight
                          size={14}
                          className={`ml-auto shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                          onClick={(e) => { e.stopPropagation(); toggleMenu(item.href); }}
                        />
                      </SidebarMenuButton>
                      <div
                        className="grid transition-[grid-template-rows,opacity] duration-200 ease-out"
                        style={{
                          gridTemplateRows: isExpanded ? '1fr' : '0fr',
                          opacity: isExpanded ? 1 : 0,
                        }}
                      >
                        <div className="overflow-hidden">
                          <ul className="ml-6 mt-0.5 space-y-0.5 border-l border-nativz-border pl-2 pb-0.5">
                            {item.children.map((child) => {
                              const cActive = isActivePath(pathname, child.href, searchParams);
                              return (
                                <li key={child.href}>
                                  <Link
                                    href={child.href}
                                    className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
                                      cActive
                                        ? 'text-accent-text bg-accent-surface'
                                        : 'text-text-muted hover:text-text-secondary hover:bg-surface-hover'
                                    }`}
                                  >
                                    <child.icon size={16} className="shrink-0" />
                                    <span className="truncate">{child.label}</span>
                                  </Link>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      </div>
                    </SidebarMenuItem>
                  );
                }

                if (item.comingSoon) {
                  return (
                    <SidebarMenuItem key={item.label + '-soon'}>
                      <SidebarMenuButton isActive={false} tooltip="Coming soon" className="opacity-40 pointer-events-none">
                        <item.icon size={18} className="shrink-0" />
                        {open && <span className="truncate">{item.label}</span>}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                }

                return (
                  <SidebarMenuItem key={item.href}>
                    <Link href={item.href}>
                      <SidebarMenuButton isActive={active} tooltip={item.label}>
                        <item.icon size={18} className="shrink-0" />
                        {open && <span className="truncate">{item.label}</span>}
                      </SidebarMenuButton>
                    </Link>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}

      </SidebarContent>

      {/* Footer: The Nerd + account */}
      <SidebarFooter className="border-t-0">
        {/* The Nerd — AI chat agent (StarBorder pattern) */}
        <div className={`px-1 pb-2 ${role === 'viewer' ? 'opacity-40 pointer-events-none' : ''}`} title={role === 'viewer' ? 'Coming soon' : undefined}>
          <Link
            href={role === 'viewer' ? '#' : `${routePrefix}/nerd`}
            className={`group/nerd relative block overflow-hidden rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-transform duration-200 ${open ? '' : 'rounded-lg'}`}
            style={{ padding: '1px 0' }}
          >
            {/* Orbiting star — bottom */}
            <div
              className="absolute w-[300%] h-[50%] opacity-70 group-hover/nerd:opacity-100 bottom-[-11px] right-[-250%] rounded-full z-0 transition-opacity duration-300"
              style={{
                background: 'radial-gradient(circle, var(--accent-text), transparent 10%)',
                animation: 'star-movement-bottom 6s linear infinite alternate',
              }}
            />
            {/* Orbiting star — top */}
            <div
              className="absolute w-[300%] h-[50%] opacity-70 group-hover/nerd:opacity-100 top-[-10px] left-[-250%] rounded-full z-0 transition-opacity duration-300"
              style={{
                background: 'radial-gradient(circle, var(--accent), transparent 10%)',
                animation: 'star-movement-top 6s linear infinite alternate',
              }}
            />

            <div
              className={`relative z-[1] flex items-center border border-nativz-border bg-surface transition-all duration-200 group-hover/nerd:shadow-[0_0_20px_var(--accent-surface)] ${
                open ? 'gap-2.5 rounded-xl px-3 py-2.5' : 'justify-center rounded-lg px-2 py-2.5'
              } ${
                isActivePath(pathname, '/admin/nerd')
                  ? 'border-accent/30 shadow-[0_0_16px_var(--accent-surface)]'
                  : 'group-hover/nerd:border-accent/25'
              }`}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0 bg-accent-surface">
                <BotMessageSquare size={16} className={`transition-colors duration-200 ${
                  isActivePath(pathname, '/admin/nerd') ? 'text-accent-text' : 'text-accent-text/70 group-hover/nerd:text-accent-text'
                }`} />
              </div>
              {open && (
                <p className="text-sm font-semibold truncate text-text-primary min-w-0 flex-1">
                  The Nerd
                </p>
              )}
            </div>
          </Link>
        </div>

        <SidebarAccount
          userName={userName}
          avatarUrl={avatarUrl}
          settingsHref={settingsPath}
          logoutRedirect={logoutPath}
          collapsed={!open}
          clientViewHref={role === 'admin' ? '/portal' : undefined}
        />

        {/* Sidebar layout mode picker — Expanded / Collapsed / Hover */}
        <SidebarModePicker />

      </SidebarFooter>
    </Sidebar>
  );
}
