'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Search, Settings, PanelLeftClose, Telescope } from 'lucide-react';
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
import { PORTAL_HOME_PATH } from '@/lib/portal/client-surface';

/** Client portal: research + settings only (other routes redirect in middleware). */
const NAV_ITEMS: { href: string; label: string; icon: typeof Telescope; flag: string | null }[] = [
  { href: '/portal/search/new', label: 'Research', icon: Telescope, flag: 'can_search' },
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
  const navItems = NAV_ITEMS.filter((item) => {
    if (!item.flag) return true;
    return flags?.[item.flag] !== false;
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
            {navItems.map((item) => {
              const active =
                item.href === '/portal/search/new'
                  ? pathname.startsWith('/portal/search')
                  : pathname === item.href || pathname.startsWith(item.href + '/');
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
          logoutRedirect="/portal/login"
          collapsed={!open}
        />
      </SidebarFooter>
    </Sidebar>
  );
}
