'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  LayoutDashboard,
  BarChart3,
  ChevronRight,
  Contact,
  ImagePlus,
  StickyNote,
  TrendingUp,
  MessagesSquare,
  Receipt,
  CreditCard,
  Settings as SettingsIcon,
  Users,
  BookUser,
  ShoppingBag,
  Bell,
  Calendar,
  CalendarDays,
  ClipboardCheck,
  Cpu,
  Gauge,
  Telescope,
  Workflow,
} from 'lucide-react';
import { BrandSwitcher } from '@/components/portal/brand-switcher';
import { useBrandMode } from '@/components/layout/brand-mode-provider';
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarSeparator,
} from './sidebar';

// ---------------------------------------------------------------------------
// Nav config
// ---------------------------------------------------------------------------

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  children?: {
    href: string;
    label: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    /** Hide from non-super-admins. Page also redirects server-side. */
    superAdminOnly?: boolean;
  }[];
  /** When true, item is grayed out and non-clickable with "Coming soon" tooltip */
  comingSoon?: boolean;
  /** Stable identifier for hide-preferences and tests — survives portal
   *  href remapping. Defaults to the admin href, carried through when a
   *  viewer renders the same item at a different URL. */
  navKey?: string;
  /** Hide from non-super-admins. Page also redirects server-side. */
  superAdminOnly?: boolean;
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
//
// Capitalization: sidebar labels use **Title Case** ("Brand Profile",
// "Settings", "Competitor Spying"). This intentionally overrides the
// general sentence-case rule in CLAUDE.md — Jack prefers Title Case for
// nav items specifically (confirmed 2026-04-23). Don't normalize back.
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
      { href: '/finder/new', label: 'Trend Finder', icon: TrendingUp },
      { href: '/lab', label: 'Strategy Lab', icon: MessagesSquare },
      {
        // "Content" parent — splits the old flat Calendar row into a
        // 2-child accordion (Calendar + Review). Default child stays
        // /admin/calendar so existing bookmarks land on the scheduler;
        // Review is the new share-link inventory subpage.
        href: '/admin/calendar',
        label: 'Content',
        icon: CalendarDays,
        children: [
          { href: '/admin/calendar', label: 'Calendar', icon: CalendarDays },
          // Review is brand-scoped, lives at root /review (no /admin/
          // prefix — same brand-root pattern as /brand-profile, /lab,
          // /spying). Same URL serves admin and viewer; the page body
          // branches on role.
          { href: '/review', label: 'Review', icon: ClipboardCheck },
        ],
      },
      {
        // NAT-62 (2026-04-22): unified landing page. Renamed back to
        // "Competitor spying" 2026-04-22 evening per Jack — feels more
        // on-brand and matches the product's irreverent register vs.
        // the corporate-sounding "intelligence". Telescope icon ("we're
        // watching from afar") replaces ScanSearch — the magnifying-
        // glass-with-arrows didn't read as surveillance.
        href: '/spying',
        label: 'Spying',
        icon: Telescope,
      },
      { href: '/brand-profile', label: 'Brand Profile', icon: BookUser },
      { href: '/notes', label: 'Notes', icon: StickyNote },
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
        href: '/admin/clients',
        label: 'Admin',
        icon: SettingsIcon,
        children: [
          // Ordered per Jack 2026-04-23: client-facing surfaces up top,
          // internal ops in the middle, platform admin at the bottom.
          { href: '/admin/clients', label: 'Clients', icon: Contact },
          // Cross-brand content command surface. Tabs cover share-link
          // oversight (Projects), Monday EM-approved queue (Quick schedule),
          // integration health (Connections), and recent notifications. The
          // brand-scoped Review subpage (Content > Review) still follows the
          // active pill for single-brand views; this surface is agency-wide.
          { href: '/admin/content-tools', label: 'Content Tools', icon: ClipboardCheck },
          // Ad Generator lives in Admin (not Brand tools) because every run
          // burns Gemini 2.5 Flash Image credits — keep it behind the
          // operator menu rather than next to free brand-research surfaces.
          { href: '/ads', label: 'Ad Generator', icon: ImagePlus },
          // Sales = unified pipeline (replaces standalone Proposals +
          // Onboarding entries). Spec:
          // docs/superpowers/specs/2026-04-25-sales-pipeline-unification.md.
          // Both legacy hrefs still redirect server-side, so any external
          // bookmarks land on the correct sub-filter.
          { href: '/admin/sales', label: 'Sales', icon: Workflow },
          { href: '/admin/users', label: 'Users', icon: Users },
          { href: '/admin/scheduling', label: 'Scheduling', icon: Calendar },
          { href: '/admin/accounting', label: 'Accounting', icon: Receipt, superAdminOnly: true },
          { href: '/admin/revenue', label: 'Revenue', icon: CreditCard },
          { href: '/admin/notifications', label: 'Notifications', icon: Bell },
          { href: '/admin/usage', label: 'Usage', icon: Gauge },
          { href: '/admin/settings', label: 'Settings', icon: SettingsIcon },
        ],
      },
    ],
  },
];

function isActivePath(pathname: string, href: string, searchParams?: URLSearchParams) {
  // Trend Finder — sidebar href points at /finder/new; any /finder/*
  // pathname (monitors, [id] detail, subtopics) should highlight this item.
  if (href.endsWith('/finder/new')) {
    const prefix = href.replace('/finder/new', '');
    return pathname.startsWith(`${prefix}/finder`);
  }

  // NOTE: the old "Competitor Tracking → /admin/analyze-social" and
  // "Settings → /admin/settings" broad-match blocks were removed. They
  // previously made the first sub-item (which shared an href with its parent
  // group) light up for every sibling route, so "Organic Social" appeared
  // selected when the user was actually on Meta Ads / Ecom.
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
  '/admin/scheduling',
  '/admin/clients',
  '/admin/sales',
  '/admin/users',
  '/admin/presentations',
  '/admin/analyze-social',
  '/admin/notifications',
  '/admin/usage',
  // Cross-brand content tooling is operator-only; viewers see only
  // their own brand's links via the unified-shell `/review` route.
  '/admin/content-tools',
  // Cost-driving brand tools stay admin-only. Spying triggers Apify scrapes
  // on every audit; the Ad Generator triggers Gemini 2.5 Flash Image
  // generations. Each page also redirects non-admins server-side (defence
  // in depth) — this set just hides them from the viewer sidebar. Brand
  // Profile, Notes, Strategy Lab, and Trend Finder are read-friendly
  // — RLS scopes them to the viewer's user_client_access.
  '/ads',
  '/spying',
  // Settings is reachable from the avatar popover — it doesn't need its
  // own nav row on the portal. Keeping it on the admin side where the gear
  // is the primary entry point to the agency settings secondary rail.
  '/admin/settings',
  '/admin/account',
  // Competitor Tracking secondary rail — all children are admin-only.
  '/admin/competitor-tracking',
]);

/** Items shown but grayed out with "Coming soon" tooltip for viewers */
const COMING_SOON_HREFS = new Set([
  '/admin/analytics',
]);

/**
 * One-off href rewrites for portal viewers. Phase 1 of the brand-root
 * migration lifted admin brand tools out of /admin/* to the root, but
 * the portal continues to serve its own copies under /portal/*. When a
 * NAV_SECTIONS item points at a root URL that has no /admin/ prefix to
 * rewrite, this table maps the root href to the portal equivalent.
 */
const PORTAL_HREF_REWRITES: Record<string, string> = {
  '/finder/new': '/portal/search/new',
  '/lab': '/portal/strategy-lab',
  '/brand-profile': '/portal/brand-profile',
  '/notes': '/portal/notes',
};

/**
 * Unified-shell href rewrites for viewers. When a NAV_SECTIONS item lives
 * under /admin/* but the viewer mirror lives at root (no /admin/ prefix),
 * we can't naively keep the admin href. Calendar is the first case: admins
 * use /admin/calendar (rich edit surface), viewers use /calendar (read-only).
 */
const VIEWER_UNIFIED_HREFS: Record<string, string> = {
  '/admin/calendar': '/calendar',
};

function getNavSectionsForRole(role: 'admin' | 'viewer', prefix: string): NavSection[] {
  if (role === 'admin') return NAV_SECTIONS;

  // Phase 2 of the brand-root migration: when the viewer is mounted inside
  // the unified `(app)` shell (`routePrefix === ''`), brand tools live at
  // root URLs identical to admin's. Skip the legacy `/portal/*` remap and
  // just filter out admin-only items. The legacy `/portal/*` shell still
  // exists for the maintenance window — it passes `routePrefix='/portal'`
  // and falls into the old remap path below.
  const isUnifiedShell = prefix === '';

  const viewerItems: NavItem[] = [];
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (ADMIN_ONLY_HREFS.has(item.href)) continue;
      const isComingSoon = COMING_SOON_HREFS.has(item.href);

      const remappedHref = (() => {
        if (isComingSoon) return '#';
        if (isUnifiedShell) return VIEWER_UNIFIED_HREFS[item.href] ?? item.href;
        return PORTAL_HREF_REWRITES[item.href] ?? item.href.replace('/admin/', `${prefix}/`);
      })();

      const remappedChildren = isComingSoon
        ? undefined
        : item.children
            ?.filter((c) => !ADMIN_ONLY_HREFS.has(c.href))
            .map((c) => ({
              ...c,
              href: isUnifiedShell
                ? VIEWER_UNIFIED_HREFS[c.href] ?? c.href
                : PORTAL_HREF_REWRITES[c.href] ?? c.href.replace('/admin/', `${prefix}/`),
            }));

      const remapped: NavItem = {
        ...item,
        href: remappedHref,
        comingSoon: isComingSoon,
        // Preserve the admin href as navKey so sidebar-hide preferences
        // stay stable whether the user is in the unified shell or the
        // legacy portal shell.
        navKey: item.href,
        children: remappedChildren,
      };
      viewerItems.push(remapped);
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
  /** Gate for super-admin-only nav items (Accounting). When false/undefined,
   *  items flagged `superAdminOnly` are filtered out in the render loop. */
  isSuperAdmin?: boolean;
}

/** Items that can never be hidden — there'd be no way back to Settings otherwise. */
const UNHIDABLE_HREFS = new Set([
  '/admin/settings',
  '/admin/dashboard',
  '/portal/settings',
]);

export function AdminSidebar({
  // userName / avatarUrl / logoutPath / settingsPath are accepted for
  // back-compat — callers still pass them. The sidebar no longer uses
  // them now that the account popover has moved to the top header on
  // both roles. Prefixed with _ so linting stays clean without changing
  // the public interface.
  userName: _userName,
  avatarUrl: _avatarUrl,
  role = 'admin',
  routePrefix = '/admin',
  logoutPath: _logoutPath = '/login',
  settingsPath: _settingsPath = '/admin/account',
  brands,
  activeBrandId,
  hiddenSidebarItems = [],
  isAdmin: _isAdmin,
  isSuperAdmin = false,
}: AdminSidebarProps) {
  const hiddenSet = new Set(
    hiddenSidebarItems.filter((href) => !UNHIDABLE_HREFS.has(href)),
  );
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Sidebar is permanently expanded — `open` used to come from useSidebar()
  // and flip between true (full width) and false (icon rail). It's now a
  // constant so the surrounding JSX can keep the same shape without
  // branching on a moving target. When the collapse UX returns, re-plumb
  // useSidebar().open here.
  const open = true;
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
                  src="/nativz-logo.png"
                  alt="Nativz"
                  width={140}
                  height={52}
                  className={`${open ? 'h-9' : 'h-5'} w-auto transition-[height] duration-200 ease-out`}
                  priority
                />
              ) : (
                // Preloaded from app/layout.tsx — hints below keep priority aligned.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src="/anderson-logo-dark.svg"
                  alt="Anderson Collaborative"
                  className={`${open ? 'h-9' : 'h-5'} w-auto transition-[height] duration-200 ease-out`}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
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
            items: section.items
              .filter((item) => !hiddenSet.has(item.navKey ?? item.href))
              .filter((item) => !item.superAdminOnly || isSuperAdmin)
              .map((item) => ({
                ...item,
                children: item.children?.filter(
                  (c) => !c.superAdminOnly || isSuperAdmin,
                ),
              })),
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
                      // active pill already telegraph position; doubling the
                      // visual weight of the selection fights the grouped-
                      // container read we're going for.
                      isActive={false}
                      onClick={() => toggleMenu(item.href)}
                    >
                      <item.icon size={18} className="shrink-0" />
                      <span className="ml-2.5 flex-1 truncate text-left">{item.label}</span>
                      <ChevronRight
                        size={14}
                        className={`ml-auto shrink-0 transition-transform duration-200 ease-out ${
                          isExpanded ? 'rotate-90' : ''
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleMenu(item.href);
                        }}
                      />
                    </SidebarMenuButton>
                  );

                  return (
                    <SidebarMenuItem key={item.href}>
                      {parentButton}

                      {/* Inline accordion — grid-rows transition drives the
                          expand / collapse of the dropdown children. Child
                          links mirror <SidebarMenuButton/>'s two-layer
                          structure (outer full-width click target + inner
                          pill span) so the active-pill shape matches flat
                          items exactly. */}
                      <div
                        className="grid transition-[grid-template-rows,opacity] duration-200 ease-out"
                        style={{
                          gridTemplateRows: isExpanded ? '1fr' : '0fr',
                          opacity: isExpanded ? 1 : 0,
                        }}
                      >
                        <div className="overflow-hidden">
                          <ul className="mt-1.5 ml-6 space-y-1 pb-1 pl-2 border-l border-nativz-border">
                            {item.children.map((child) => {
                              // Sibling-aware match: when one child's href is a
                              // prefix of another's (e.g. Admin parent
                              // /admin/clients vs. /admin/clients/[slug]),
                              // the broad `pathname.startsWith(href + '/')`
                              // rule lights up both children. Defer to the
                              // longer match — if any sibling is a more
                              // specific match for the current path, this
                              // child is not active.
                              const cActive = (() => {
                                if (pathname === child.href) return true;
                                const moreSpecific = item.children!.some(
                                  (sibling) =>
                                    sibling.href !== child.href &&
                                    sibling.href.startsWith(child.href + '/') &&
                                    (pathname === sibling.href ||
                                      pathname.startsWith(sibling.href + '/')),
                                );
                                if (moreSpecific) return false;
                                return isActivePath(pathname, child.href, searchParams);
                              })();
                              return (
                                <li key={child.href}>
                                  <Link
                                    href={child.href}
                                    className="relative flex w-full items-center min-h-[40px] text-[15px]"
                                  >
                                    <span
                                      className={`flex w-full items-center rounded-md px-2 py-1.5 transition-colors duration-150 ${
                                        cActive
                                          ? 'bg-accent-surface text-text-primary font-semibold'
                                          : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary font-medium'
                                      }`}
                                    >
                                      <child.icon size={18} className="shrink-0" />
                                      <span className="ml-2.5 truncate">{child.label}</span>
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
                      <SidebarMenuButton isActive={false} className="opacity-40 pointer-events-none">
                        <item.icon size={18} className="shrink-0" />
                        <span className="ml-2.5 flex-1 truncate text-left">{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                }

                return (
                  <SidebarMenuItem key={item.href}>
                    <Link href={item.href}>
                      <SidebarMenuButton isActive={active}>
                        <item.icon size={18} className="shrink-0" />
                        <span className="ml-2.5 flex-1 truncate text-left">{item.label}</span>
                      </SidebarMenuButton>
                    </Link>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}

      </SidebarContent>

      {/* No sidebar footer — both roles now render the account popover in
       *  the top header (admin: <AdminTopBar/> above sidebar+content;
       *  portal: <AdminHeader/> inside SidebarInset). Keeps the rail pure
       *  navigation on both sides. */}
    </Sidebar>
  );
}
