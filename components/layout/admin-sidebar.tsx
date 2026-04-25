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
  FileSignature,
  Settings as SettingsIcon,
  Users,
  BookUser,
  ShoppingBag,
  Bell,
  Calendar,
  Brain,
  Cpu,
  Gauge,
  ListChecks,
  Telescope,
  Briefcase,
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
      { href: '/ads', label: 'Ad Generator', icon: ImagePlus },
      { href: '/brain', label: 'Brain', icon: Brain },
      // NAT-57 follow-up: single entry point for the pinned brand's
      // profile. Sits between Brain (AI knowledge) and Notes (manual
      // notes) — both adjacent to it in the user's mental model as
      // "stuff about the brand that isn't a generator/tool."
      // NAT-57 follow-up: BookUser — a notebook-with-person icon reads
      // closer to "profile page" than the generic Building we started
      // with. Keeps the visual theme (outlined lucide) consistent with
      // the rest of the rail.
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
        href: '/admin/projects',
        label: 'Admin',
        icon: SettingsIcon,
        children: [
          // Ordered per Jack 2026-04-23: client-facing surfaces up top,
          // internal ops in the middle, platform admin at the bottom.
          { href: '/admin/clients', label: 'Clients', icon: Contact },
          { href: '/admin/onboarding', label: 'Onboarding', icon: ListChecks },
          { href: '/admin/users', label: 'Users', icon: Users },
          { href: '/admin/scheduling', label: 'Scheduling', icon: Calendar },
          { href: '/admin/accounting', label: 'Accounting', icon: Receipt },
          { href: '/admin/revenue', label: 'Revenue', icon: CreditCard },
          { href: '/admin/proposals', label: 'Proposals', icon: FileSignature },
          { href: '/admin/notifications', label: 'Notifications', icon: Bell },
          // Unified PM surface. /admin/shoots and /admin/edits redirect here
          // (see their page.tsx). /admin/tasks still serves the legacy task
          // UI directly — it folds into /admin/projects once the PM surface
          // reaches feature parity.
          { href: '/admin/projects', label: 'Project Management', icon: Briefcase },
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

  // Brain (formerly Knowledge): graph and meetings roll up into a single
  // sidebar item. Phase 1 of the brand-root migration renamed the directory
  // to `/(app)/brain`, so the canonical URL and the filesystem dir match.
  if (href.endsWith('/brain')) {
    const prefix = href.replace('/brain', '');
    if (pathname === `${prefix}/meetings` || pathname.startsWith(`${prefix}/meetings/`)) return true;
    return pathname === href || pathname.startsWith(href + '/');
  }

  // NOTE: the old "Competitor Tracking → /admin/analyze-social" and
  // "Settings → /admin/settings" broad-match blocks were removed. They
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
  '/admin/projects',
  '/admin/scheduling',
  '/admin/clients',
  '/admin/users',
  '/admin/presentations',
  '/admin/analyze-social',
  '/admin/notifications',
  '/admin/usage',
  // Cost-driving brand tools stay admin-only. Spying triggers Apify scrapes
  // on every audit; the Ad Generator triggers Gemini 2.5 Flash Image
  // generations. Each page also redirects non-admins server-side (defence
  // in depth) — this set just hides them from the viewer sidebar. Brand
  // Profile, Notes, Brain, Strategy Lab, and Trend Finder are read-friendly
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
  '/admin/competitor-tracking/tiktok-shop',
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
        if (isUnifiedShell) return item.href;
        return PORTAL_HREF_REWRITES[item.href] ?? item.href.replace('/admin/', `${prefix}/`);
      })();

      const remappedChildren = isComingSoon
        ? undefined
        : item.children
            ?.filter((c) => !ADMIN_ONLY_HREFS.has(c.href))
            .map((c) => ({
              ...c,
              href: isUnifiedShell
                ? c.href
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
                              const cActive = isActivePath(pathname, child.href, searchParams);
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
