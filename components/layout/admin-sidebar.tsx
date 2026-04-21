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
  Users,
  Facebook,
  Store,
  ShoppingBag,
  Bell,
  Camera,
  Calendar,
  Brain,
  Cpu,
} from 'lucide-react';
import { SidebarAccount } from '@/components/layout/sidebar-account';
import { SidebarModePicker } from '@/components/layout/sidebar-mode-picker';
import { SidebarCollapsedFlyout } from '@/components/layout/sidebar-collapsed-flyout';
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
  SidebarTrigger,
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
//
// Layout: three unlabeled sections separated by a thin divider. Brand-scoped
// tools live at the top as flat items; everything operational + admin lives
// inside a single "Admin" dropdown at the bottom. The dropdown keeps the
// sidebar tight — the working brand is the center of attention, admin surfaces
// are one click away without cluttering the rail.
const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Dashboard',
    items: [
      { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
  {
    label: 'Brand tools',
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
      { href: '/admin/knowledge', label: 'Brain', icon: Brain },
      { href: '/admin/notes', label: 'Notes', icon: StickyNote },
    ],
  },
  {
    // Single dropdown that vacuums up every operational + platform-admin
    // surface into one tidy menu. Keeps the rail visually calm — users
    // doing brand work don't see a wall of team-ops icons; when they need
    // to jump into admin they expand this one parent.
    label: 'Admin',
    items: [
      {
        href: '/admin/tasks',
        label: 'Admin',
        icon: SettingsIcon,
        children: [
          { href: '/admin/tasks', label: 'Tasks', icon: CheckSquare },
          { href: '/admin/pipeline', label: 'Edits', icon: Scissors },
          { href: '/admin/shoots', label: 'Shoots', icon: Camera },
          { href: '/admin/scheduler', label: 'Content calendars', icon: Calendar },
          { href: '/admin/clients', label: 'Clients', icon: Contact },
          { href: '/admin/users', label: 'Users', icon: Users },
          { href: '/admin/accounting', label: 'Accounting', icon: Receipt },
          { href: '/admin/notifications', label: 'Notifications', icon: Bell },
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
  '/admin/notifications',
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

  // On every pathname change, reset manual expansions and seed the
  // dropdown that contains the new active route. This is the "you
  // landed on a sub-page, so open the parent for you" UX — but because
  // we assign the set rather than OR'ing `childActive` into the render
  // path, the user can still click the chevron to close it and it stays
  // closed until they navigate to a different path. Previously,
  // `isExpanded = childActive || expandedMenus.has(href)` made the
  // chevron useless on sub-pages (OR always true).
  //
  // searchParams is intentionally excluded from deps so query-string
  // updates don't fight a manual close.
  useEffect(() => {
    const sections = getNavSectionsForRole(role, routePrefix);
    const seeds = new Set<string>();
    for (const section of sections) {
      for (const item of section.items) {
        if (!item.children) continue;
        if (item.children.some((c) => isActivePath(pathname, c.href, searchParams))) {
          seeds.add(item.href);
        }
      }
    }
    setExpandedMenus(seeds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, role, routePrefix]);

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
      {/* Sidebar header — portal still shows the agency logo + BrandSwitcher
          here (portal doesn't use the app-shell top bar). Admin routes now
          render the logo + brand pill in <AdminTopBar> above the rail, so
          the admin sidebar header renders empty (or with a tiny affordance
          space) to keep nav-icon y-alignment across both roles. */}
      {role === 'viewer' ? (
        <SidebarHeader className="h-[60px] py-3 flex items-center">
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

          {brands && brands.length > 1 && activeBrandId && (
            <div className="mb-1 mt-3">
              <BrandSwitcher activeBrandId={activeBrandId} brands={brands} collapsed={!open} />
            </div>
          )}
        </SidebarHeader>
      ) : null}

      {/* Navigation — Supabase-style: thin dividers between groups, no labels */}
      <SidebarContent>
        {getNavSectionsForRole(role, routePrefix)
          .map((section) => ({
            ...section,
            items: section.items.filter((item) => !hiddenSet.has(item.navKey ?? item.href)),
          }))
          .filter((section) => section.items.length > 0)
          .map((section, idx) => (
          <SidebarGroup key={section.label || `section-${idx}`}>
            {idx > 0 && <SidebarSeparator />}
            <SidebarMenu>
              {section.items.map((item) => {
                const active = isActivePath(pathname, item.href, searchParams);

                // Dropdown parent — one render path for collapsed AND expanded
                // so the label + chevron reveal animates with the same
                // transition-[max-width,margin,opacity] the flat items below
                // use. Collapsed mode additionally exposes the children as a
                // hover flyout so they stay reachable without expanding first.
                if (item.children) {
                  // Pure manual-state. The route-change effect above seeds
                  // this dropdown open when a child route becomes active,
                  // but once seeded the user's chevron clicks fully own it.
                  const isExpanded = expandedMenus.has(item.href);

                  const parentButton = (
                    <SidebarMenuButton
                      // Parent row intentionally NOT painted active when a
                      // child is. The expanded accordion + the child's own
                      // active pill already telegraph position; also
                      // highlighting the parent doubles the visual weight
                      // of the selection and fights the RankPrompt-style
                      // "collapsed container" read we're going for.
                      isActive={false}
                      tooltip={!open ? item.label : undefined}
                      onClick={() => toggleMenu(item.href)}
                    >
                      <item.icon size={18} className="shrink-0" />
                      <span
                        className={`overflow-hidden whitespace-nowrap transition-[max-width,margin,opacity] duration-200 ease-out ${
                          open ? 'max-w-[160px] ml-2.5 opacity-100' : 'max-w-0 ml-0 opacity-0'
                        }`}
                      >
                        {item.label}
                      </span>
                      <ChevronRight
                        size={14}
                        className={`shrink-0 transition-[max-width,margin,opacity,transform] duration-200 ease-out ${
                          open ? 'ml-auto max-w-4 opacity-100' : 'ml-0 max-w-0 opacity-0'
                        } ${isExpanded ? 'rotate-90' : ''}`}
                        onClick={(e) => { e.stopPropagation(); toggleMenu(item.href); }}
                      />
                    </SidebarMenuButton>
                  );

                  return (
                    <SidebarMenuItem key={item.href}>
                      {/* When the rail is collapsed, wrap the parent button
                          in a portaled hover flyout so children stay reachable
                          without expanding first. We have to portal — both
                          Sidebar and SidebarContent carry overflow-hidden, so
                          an in-tree absolute flyout gets clipped at the rail's
                          right edge. When expanded, render the button bare. */}
                      {!open ? (
                        <SidebarCollapsedFlyout
                          label={item.label}
                          items={item.children}
                          isActive={(href) => isActivePath(pathname, href, searchParams)}
                        >
                          {parentButton}
                        </SidebarCollapsedFlyout>
                      ) : (
                        parentButton
                      )}

                      {/* Inline accordion — renders in BOTH rail states so a
                          dropdown that was open stays "open" when the rail
                          collapses: children keep a visual presence in the
                          rail (icon-only column, center-aligned, matching
                          the treatment of flat items) instead of vanishing.
                          Hover-flyout above still provides labels on demand.
                          Reveal on open-rail uses the accordion's own
                          grid-row transition so the label animation lands
                          in lockstep with the flat-item label reveal. */}
                      <div
                        className="grid transition-[grid-template-rows,opacity] duration-200 ease-out"
                        style={{
                          gridTemplateRows: isExpanded ? '1fr' : '0fr',
                          opacity: isExpanded ? 1 : 0,
                        }}
                      >
                        <div className="overflow-hidden">
                          <ul
                            className={`space-y-1 pb-1 transition-[margin,padding,border-color] duration-200 ease-out ${
                              open
                                ? 'mt-1.5 ml-6 pl-2 border-l border-nativz-border'
                                : 'mt-0.5 ml-0 pl-0 border-l border-transparent'
                            }`}
                          >
                            {item.children.map((child) => {
                              const cActive = isActivePath(pathname, child.href, searchParams);
                              return (
                                <li key={child.href}>
                                  <Link
                                    href={child.href}
                                    className="relative flex w-full items-center min-h-[40px] text-[15px]"
                                  >
                                    {/* Mirror SidebarMenuButton's two-layer
                                        structure exactly so dropdown children
                                        animate in lockstep with flat items:
                                        outer Link is full-width (click target
                                        spans the row); inner span holds the
                                        active-pill and grows to w-full only
                                        when the rail is expanded so the pill
                                        shrinks around the icon when
                                        collapsed. Icon fixed at 18, label
                                        fades via the same max-width +
                                        margin + opacity transition flat
                                        items use. */}
                                    <span
                                      className={`flex items-center rounded-md px-2 py-1.5 transition-colors duration-150 ${
                                        open ? 'w-full' : ''
                                      } ${
                                        cActive
                                          ? 'bg-accent-surface text-text-primary font-semibold'
                                          : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary font-medium'
                                      }`}
                                    >
                                      <child.icon size={18} className="shrink-0" />
                                      <span
                                        className={`overflow-hidden whitespace-nowrap transition-[max-width,margin,opacity] duration-200 ease-out ${
                                          open ? 'max-w-[160px] ml-2.5 opacity-100' : 'max-w-0 ml-0 opacity-0'
                                        }`}
                                      >
                                        {child.label}
                                      </span>
                                    </span>
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

      {/* Footer: sidebar layout controls.
       *
       * For admin routes the account popover (avatar + settings + API docs +
       * sign out) lives in <AdminTopBar> instead of here, so the rail footer
       * only carries the mode picker. Portal still gets the account popover
       * here — portal uses the sidebar for all global actions. */}
      <SidebarFooter className="border-t-0">
        {role === 'viewer' && (
          <SidebarAccount
            userName={userName}
            avatarUrl={avatarUrl}
            settingsHref={settingsPath}
            logoutRedirect={logoutPath}
            collapsed={!open}
          />
        )}

        {/* Sidebar controls row — quick toggle on the left, mode popover
         *  on the right. Toggle is the fast path (collapse/expand with one
         *  click, matches muscle memory). Mode picker stays for the
         *  "expand on hover" preference. */}
        <div className={open ? 'flex items-center gap-1' : 'flex flex-col items-center gap-1'}>
          <SidebarTrigger className="shrink-0" />
          <SidebarModePicker />
        </div>

      </SidebarFooter>
    </Sidebar>
  );
}
