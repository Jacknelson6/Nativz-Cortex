'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  LayoutDashboard,
  BarChart3,
  CheckSquare,
  ChevronRight,
  Contact,
  ImagePlus,
  StickyNote,
  Scissors,
  TrendingUp,
  MessagesSquare,
  ScanSearch,
  Receipt,
  Settings as SettingsIcon,
  Wrench,
  Users,
  Facebook,
  Store,
  ShoppingBag,
  LayoutGrid,
  Mail,
  Workflow,
  Camera,
  ThumbsUp,
  Megaphone,
  Calendar,
  Brain,
  Cpu,
} from 'lucide-react';
import { SidebarAccount } from '@/components/layout/sidebar-account';
import { SidebarModePicker } from '@/components/layout/sidebar-mode-picker';
import { BrandSwitcher } from '@/components/portal/brand-switcher';
import { useBrandMode } from '@/components/layout/brand-mode-provider';
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
  /** Stable identifier for hide-preferences and tests — survives portal
   *  href remapping. Defaults to the admin href, carried through when a
   *  viewer renders the same item at a different URL. */
  navKey?: string;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

// Parents with `children` expand to an inline accordion (RankPrompt-style).
// Clicking the parent navigates to its default child AND expands the list,
// so existing deep links (e.g. /admin/analyze-social) keep working.
// Route kept at /admin/analyze-social for Competitor Spying to avoid breaking
// outbound share links (/shared/analyze-social/[token]).
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
      { href: '/admin/search/new', label: 'Trend Finder', icon: TrendingUp },
      { href: '/admin/strategy-lab', label: 'Strategy Lab', icon: MessagesSquare },
      {
        href: '/admin/analyze-social',
        label: 'Competitor Spying',
        icon: ScanSearch,
        children: [
          { href: '/admin/analyze-social', label: 'Organic Social', icon: Users },
          { href: '/admin/competitor-tracking/meta-ads', label: 'Meta Ads', icon: Facebook },
          { href: '/admin/competitor-tracking/ecom', label: 'Ecom stores', icon: Store },
          { href: '/admin/competitor-tracking/tiktok-shop', label: 'TikTok Shop', icon: ShoppingBag },
        ],
      },
      { href: '/admin/ad-creatives', label: 'Ad Generator', icon: ImagePlus },
      { href: '/admin/notes', label: 'Notes', icon: StickyNote },
    ],
  },
  {
    label: 'Manage',
    items: [
      { href: '/admin/clients', label: 'Clients', icon: Contact },
      {
        href: '/admin/pipeline',
        label: 'Edits',
        icon: Scissors,
        children: [
          { href: '/admin/pipeline', label: 'All stages', icon: Workflow },
          { href: '/admin/shoots', label: 'Shoot calendar', icon: Camera },
          { href: '/admin/pipeline?stage=editing', label: 'Editing', icon: Scissors },
          { href: '/admin/pipeline?stage=scheduling', label: 'Approvals & handoff', icon: ThumbsUp },
          { href: '/admin/pipeline?stage=boosting', label: 'Boosting', icon: Megaphone },
          { href: '/admin/scheduler', label: 'Calendars', icon: Calendar },
        ],
      },
      { href: '/admin/tasks', label: 'Tasks', icon: CheckSquare },
      {
        href: '/admin/tools',
        label: 'Tools',
        icon: Wrench,
        children: [
          { href: '/admin/tools', label: 'Overview', icon: LayoutGrid },
          { href: '/admin/tools/users', label: 'Users', icon: Users },
          { href: '/admin/tools/accounting', label: 'Accounting', icon: Receipt },
          { href: '/admin/tools/email', label: 'Email', icon: Mail },
        ],
      },
      {
        href: '/admin/settings/ai',
        label: 'Settings',
        icon: SettingsIcon,
        children: [
          { href: '/admin/knowledge', label: 'Brain', icon: Brain },
          { href: '/admin/settings/ai', label: 'AI settings', icon: Cpu },
        ],
      },
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

  // Tools hub — stay active on every /admin/tools/* child (Users, Accounting, Email).
  if (href === '/admin/tools') {
    if (pathname === '/admin/tools' || pathname.startsWith('/admin/tools/')) return true;
  }

  // NOTE: the old "Competitor Tracking → /admin/analyze-social" and
  // "Settings → /admin/settings/ai" broad-match blocks were removed. They
  // previously made the first sub-item (which shared an href with its parent
  // group) light up for every sibling route, so "Organic Social" appeared
  // selected when the user was actually on Meta Ads / Ecom / TikTok Shop.
  // The parent row is still highlighted via `childActive` in the render loop
  // (any child match promotes the parent), so no behaviour is lost.

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
  '/admin/accounting',
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
  '/admin/tools',
  // Settings is reachable from the avatar popover — it doesn't need its
  // own nav row on the portal. Keeping it on the admin side where the gear
  // is the primary entry point to the agency settings secondary rail.
  '/admin/settings/ai',
  // Competitor Tracking secondary rail — all children are admin-only.
  '/admin/competitor-tracking',
  '/admin/competitor-tracking/tiktok-shop',
]);

/** Items shown but grayed out with "Coming soon" tooltip for viewers */
const COMING_SOON_HREFS = new Set([
  '/admin/analytics',
]);

/**
 * One-off href rewrites for portal viewers. Used when the portal route
 * doesn't share the admin path suffix (e.g. admin's /content-lab maps
 * to portal's /content-lab). Keyed on the admin href so the lookup
 * lines up with NAV_SECTIONS.
 */
const PORTAL_HREF_REWRITES: Record<string, string> = {
  '/admin/strategy-lab': '/portal/strategy-lab',
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
      // that don't share the admin suffix, e.g. content-lab → content-lab)
      const remapped: NavItem = {
        ...item,
        href: isComingSoon
          ? '#'
          : (portalRewrite ?? item.href.replace('/admin/', `${prefix}/`)),
        comingSoon: isComingSoon,
        // Preserve the admin href as navKey so sidebar-hide preferences
        // stay stable whether the user is looking at the admin or portal
        // shell.
        navKey: item.href,
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
  /** Per-user hidden nav items (hrefs). Settings + Dashboard can't be hidden
   *  — they're filtered out of the hidden list to keep an escape hatch. */
  hiddenSidebarItems?: string[];
  /** Accepted for backwards compatibility — portal layout still passes this
   *  when an admin impersonates a viewer. Unused now that Client view has
   *  been removed from the avatar popover; kept to avoid churning callers. */
  isAdmin?: boolean;
}

/** Items that can never be hidden — there'd be no way back to Settings otherwise. */
const UNHIDABLE_HREFS = new Set([
  '/admin/settings/ai',
  '/admin/dashboard',
  '/portal/settings',
]);

export function AdminSidebar({
  userName,
  avatarUrl,
  role = 'admin',
  routePrefix = '/admin',
  logoutPath = '/admin/login',
  settingsPath = '/admin/settings',
  brands,
  activeBrandId,
  hiddenSidebarItems = [],
  isAdmin: _isAdmin,
}: AdminSidebarProps) {
  const hiddenSet = new Set(
    hiddenSidebarItems.filter((href) => !UNHIDABLE_HREFS.has(href)),
  );
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { open } = useSidebar();
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set());
  const [showHiTooltip, setShowHiTooltip] = useState(false);
  const { mode } = useBrandMode();

  // Auto-collapse manual expansions whenever the user navigates. The
  // active dropdown still stays open because its `childActive` flag
  // forces `isExpanded=true` in the render pass — this effect only
  // drops stale "I peeked at Settings" state so two dropdowns never
  // stay open simultaneously after a route change.
  useEffect(() => {
    setExpandedMenus(new Set());
  }, [pathname]);

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
      {/* Agency logo lives inside the sidebar header as its own dedicated
          element so it (a) scales with the sidebar's open/collapsed state and
          (b) stays within the primary sidebar's x-bounds — a fixed-position
          overlay overlapped the "← Back to dashboard" text in the secondary
          Edits / Settings rails. Click keeps the "Hi there!" easter egg. */}
      <SidebarHeader className="h-[60px] py-3 flex items-center">
        {/* Header height is locked to 60px so nav icons sit at the same y
            in both states. When the rail is expanded we render the full
            wordmark; when collapsed we swap to the favicon-sized icon
            mark so there's still a brand presence in the corner. */}
        <div className="relative flex h-9 w-full items-center justify-center">
          <button
            type="button"
            onClick={() => {
              setShowHiTooltip(true);
              setTimeout(() => setShowHiTooltip(false), 2200);
            }}
            aria-label="Hi there!"
            className="flex items-center justify-center transition-opacity duration-200 cursor-pointer hover:opacity-80"
          >
            {mode === 'nativz' ? (
              <Image
                src="/nativz-logo.svg"
                alt="Nativz"
                width={140}
                height={52}
                className={`${open ? 'h-9' : 'h-5'} w-auto transition-[height] duration-200 ease-out`}
                priority
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src="/anderson-logo-dark.svg"
                alt="Anderson Collaborative"
                className={`${open ? 'h-9' : 'h-5'} w-auto transition-[height] duration-200 ease-out`}
              />
            )}
          </button>

          {showHiTooltip && (
            <div
              className="absolute left-1/2 top-full mt-2 -translate-x-1/2 pointer-events-none"
              style={{ animation: 'hiTooltip 2.2s cubic-bezier(0.16,1,0.3,1) forwards' }}
            >
              <div className="whitespace-nowrap rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm font-medium text-text-primary shadow-elevated">
                Hi there! 👋
              </div>
            </div>
          )}
        </div>

        {role === 'viewer' && brands && brands.length > 1 && activeBrandId && (
          <div className="mb-1 mt-3">
            <BrandSwitcher activeBrandId={activeBrandId} brands={brands} collapsed={!open} />
          </div>
        )}
      </SidebarHeader>

      {/* Navigation — Supabase-style: thin dividers between groups, no labels */}
      <SidebarContent>
        {getNavSectionsForRole(role, routePrefix)
          .map((section) => ({
            ...section,
            items: section.items.filter((item) => !hiddenSet.has(item.navKey ?? item.href)),
          }))
          .filter((section) => section.items.length > 0)
          .map((section, idx) => (
          <SidebarGroup key={section.label}>
            {idx > 0 && <SidebarSeparator />}
            <SidebarMenu>
              {section.items.map((item) => {
                const active = isActivePath(pathname, item.href, searchParams);

                // Collapsed rail + dropdown parent: render the icon as a
                // clickable link AND a hover flyout so the children stay
                // reachable without first expanding the sidebar.
                if (item.children && !open) {
                  const childActive = item.children.some((c) => isActivePath(pathname, c.href, searchParams));
                  return (
                    <SidebarMenuItem key={item.href} className="group/flyout">
                      <Link href={item.href}>
                        <SidebarMenuButton isActive={active || childActive} tooltip={undefined}>
                          <item.icon size={18} className="shrink-0" />
                        </SidebarMenuButton>
                      </Link>
                      <div
                        className="absolute left-full top-0 ml-2 z-50 opacity-0 pointer-events-none translate-x-1 transition-[opacity,transform] duration-150 ease-out group-hover/flyout:opacity-100 group-hover/flyout:pointer-events-auto group-hover/flyout:translate-x-0"
                      >
                        <div className="min-w-[200px] rounded-lg border border-nativz-border bg-surface shadow-dropdown py-1">
                          <div className="px-3 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                            {item.label}
                          </div>
                          <ul className="px-1">
                            {item.children.map((child) => {
                              const cActive = isActivePath(pathname, child.href, searchParams);
                              return (
                                <li key={child.href}>
                                  <Link
                                    href={child.href}
                                    className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
                                      cActive
                                        ? 'text-accent-text bg-accent-surface'
                                        : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'
                                    }`}
                                  >
                                    <child.icon size={14} className="shrink-0" />
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

                if (item.children && open) {
                  const childActive = item.children.some((c) => isActivePath(pathname, c.href, searchParams));
                  // `isExpanded` is the OR of "this dropdown contains the
                  // current page" and "user manually toggled it open". The
                  // parent's own `href` (active) is intentionally NOT in this
                  // union — the parent button is a pure toggle, clicking it
                  // never navigates, so we don't want it painting itself open.
                  const isExpanded = childActive || expandedMenus.has(item.href);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={childActive}
                        tooltip={item.label}
                        onClick={() => toggleMenu(item.href)}
                      >
                        <item.icon size={18} className="shrink-0" />
                        {/* `ml-2.5` matches the icon → label gap used by flat
                            nav items below so parents with a dropdown chevron
                            don't visually drift left relative to siblings. */}
                        <span className="ml-2.5 truncate">{item.label}</span>
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
                          <ul className="ml-6 mt-1.5 space-y-1 border-l border-nativz-border pl-2 pb-1">
                            {item.children.map((child) => {
                              const cActive = isActivePath(pathname, child.href, searchParams);
                              return (
                                <li key={child.href}>
                                  <Link
                                    href={child.href}
                                    className={`flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium transition-colors ${
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
                        <span
                          className={`overflow-hidden whitespace-nowrap transition-[max-width,margin,opacity] duration-200 ease-out ${
                            open ? 'max-w-[160px] ml-2.5 opacity-100' : 'max-w-0 ml-0 opacity-0'
                          }`}
                        >
                          {item.label}
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                }

                return (
                  <SidebarMenuItem key={item.href}>
                    <Link href={item.href}>
                      <SidebarMenuButton isActive={active} tooltip={item.label}>
                        <item.icon size={18} className="shrink-0" />
                        <span
                          className={`overflow-hidden whitespace-nowrap transition-[max-width,margin,opacity] duration-200 ease-out ${
                            open ? 'max-w-[160px] ml-2.5 opacity-100' : 'max-w-0 ml-0 opacity-0'
                          }`}
                        >
                          {item.label}
                        </span>
                      </SidebarMenuButton>
                    </Link>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}

      </SidebarContent>

      {/* Footer: account */}
      <SidebarFooter className="border-t-0">
        <SidebarAccount
          userName={userName}
          avatarUrl={avatarUrl}
          settingsHref={settingsPath}
          logoutRedirect={logoutPath}
          collapsed={!open}
          apiDocsHref={role === 'admin' ? '/admin/nerd/api' : undefined}
        />

        {/* Sidebar layout mode picker — Expanded / Collapsed / Hover */}
        <SidebarModePicker />

      </SidebarFooter>
    </Sidebar>
  );
}
