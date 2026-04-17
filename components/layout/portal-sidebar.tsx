'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Search, Settings, PanelLeftClose, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SidebarAccount } from '@/components/layout/sidebar-account';
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
import type { FeatureFlags } from '@/lib/portal/get-portal-client';
import { portalToolTooltipText } from '@/lib/portal/feature-flags';
import { PORTAL_HOME_PATH } from '@/lib/portal/client-surface';

/**
 * Client portal sidebar.
 * `flag` gates visibility:
 *   - null      → always enabled (e.g. Settings)
 *   - required  → strict filter, item is hidden when false
 *   - optional  → shown grayed out when false, with `disabledTooltip`
 *                 copy that tells the user why it's disabled
 */
interface PortalNavItem {
  href: string;
  label: string;
  icon: typeof Search;
  flag: keyof FeatureFlags | null;
  /** When set on a flag-gated item, show the item even when disabled,
   *  grayed out with this tooltip. */
  disabledTooltip?: 'coming_soon' | 'ask_team';
}

const NAV_ITEMS: PortalNavItem[] = [
  { href: '/portal/search/new', label: 'Research', icon: Search, flag: 'can_search' },
  {
    href: '/portal/competitor-tracking/tiktok-shop',
    label: 'TikTok Shop',
    icon: ShoppingBag,
    flag: 'can_view_tiktok_shop',
    disabledTooltip: 'ask_team',
  },
  { href: '/portal/settings', label: 'Settings', icon: Settings, flag: null },
];

interface PortalBrand {
  id: string;
  name: string;
  slug: string;
  agency: string | null;
  logo_url: string | null;
  organization_id: string;
}

interface PortalSidebarProps {
  userName?: string;
  avatarUrl?: string | null;
  featureFlags?: FeatureFlags;
  brands?: PortalBrand[];
  activeBrandId?: string | null;
}

export function PortalSidebar({ userName, avatarUrl, featureFlags, brands, activeBrandId }: PortalSidebarProps) {
  const pathname = usePathname();
  const { open, toggleSidebar } = useSidebar();

  const flags = featureFlags as Record<string, boolean> | undefined;

  // Three states per item:
  //   enabled    → render as a normal link
  //   disabled   → render grayed-out with tooltip (item.disabledTooltip set)
  //   hidden     → filtered out entirely
  const navItems = NAV_ITEMS.flatMap((item) => {
    if (!item.flag) return [{ item, disabled: false }];
    const on = flags?.[item.flag] !== false;
    if (on) return [{ item, disabled: false }];
    if (item.disabledTooltip) return [{ item, disabled: true }];
    return [];
  });

  const showBrandSwitcher = brands && brands.length > 1 && activeBrandId;

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-nativz-border">
        <Link
          href={PORTAL_HOME_PATH}
          className={`flex items-center hover:opacity-90 transition-opacity duration-150 mb-3 ${
            open ? 'flex-col -space-y-0.5' : 'justify-center'
          }`}
        >
          <Image
            src="/nativz-logo.svg"
            alt="Nativz"
            width={open ? 90 : 28}
            height={open ? 34 : 10}
            className={open ? 'h-7 w-auto' : 'h-5 w-auto'}
            priority
          />
          {open && (
            <span className="text-[10px] font-semibold text-text-muted tracking-[0.28em] uppercase">
              Portal
            </span>
          )}
        </Link>

        {showBrandSwitcher && (
          <div className="mb-2">
            <BrandSwitcher
              activeBrandId={activeBrandId}
              brands={brands}
              collapsed={!open}
            />
          </div>
        )}

        {featureFlags?.can_search !== false && (
          <Link href="/portal/search/new">
            {open ? (
              <Button
                shape="pill"
                className="w-full border border-nativz-border bg-background text-text-primary shadow-none hover:bg-surface-hover hover:border-nativz-border/80"
              >
                <Search size={16} />
                New search
              </Button>
            ) : (
              <Button
                shape="pill"
                className="w-full !px-0 justify-center border border-nativz-border bg-background shadow-none hover:bg-surface-hover"
              >
                <Search size={16} />
              </Button>
            )}
          </Link>
        )}
      </SidebarHeader>

      <SidebarContent className="px-2.5">
        <SidebarGroup>
          <SidebarMenu className="gap-1.5">
            {navItems.map(({ item, disabled }) => {
              const active =
                !disabled &&
                (item.href === '/portal/search/new'
                  ? pathname.startsWith('/portal/search')
                  : pathname === item.href || pathname.startsWith(item.href + '/'));

              if (disabled) {
                const tooltipText = portalToolTooltipText(item.disabledTooltip ?? 'ask_team');
                return (
                  <SidebarMenuItem key={item.href}>
                    <div
                      title={tooltipText}
                      aria-disabled="true"
                      className="block w-full cursor-not-allowed"
                    >
                      <SidebarMenuButton
                        isActive={false}
                        tooltip={tooltipText}
                        className="opacity-40 pointer-events-none"
                      >
                        <item.icon size={18} className="shrink-0 opacity-90" />
                        {open && (
                          <>
                            <span className="truncate font-medium">{item.label}</span>
                            <span className="ml-auto rounded-full border border-nativz-border bg-background px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-text-muted">
                              {item.disabledTooltip === 'coming_soon' ? 'Soon' : 'Locked'}
                            </span>
                          </>
                        )}
                      </SidebarMenuButton>
                    </div>
                  </SidebarMenuItem>
                );
              }

              return (
                <SidebarMenuItem key={item.href}>
                  <Link href={item.href} className="block w-full">
                    <SidebarMenuButton isActive={active} tooltip={item.label}>
                      <item.icon size={18} className="shrink-0 opacity-90" />
                      {open && <span className="truncate font-medium">{item.label}</span>}
                    </SidebarMenuButton>
                  </Link>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <button
          type="button"
          onClick={toggleSidebar}
          className={`mb-2 flex cursor-pointer items-center rounded-lg border border-transparent text-text-muted transition-colors hover:border-nativz-border hover:bg-surface-hover hover:text-text-secondary ${
            open ? 'w-full gap-2 px-2.5 py-2 text-xs' : 'w-full justify-center py-2'
          }`}
        >
          <PanelLeftClose size={14} className={`transition-transform duration-200 ${open ? '' : 'rotate-180'}`} />
          {open && <span>Collapse</span>}
        </button>

        <SidebarSeparator />

        <SidebarAccount
          userName={userName}
          avatarUrl={avatarUrl}
          settingsHref="/portal/settings"
          logoutRedirect="/admin/login"
          collapsed={!open}
        />
      </SidebarFooter>
    </Sidebar>
  );
}
