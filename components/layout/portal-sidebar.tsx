'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Search, FileText, Settings, Lightbulb, PanelLeftClose, Bell, Telescope, Calendar, Microscope, Brain, Sliders } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SidebarAccount } from '@/components/layout/sidebar-account';
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

const ALL_NAV_ITEMS: { href: string; label: string; icon: typeof LayoutDashboard; flag: string | null }[] = [
  { href: '/portal/dashboard', label: 'Dashboard', icon: LayoutDashboard, flag: null },
  { href: '/portal/notifications', label: 'Notifications', icon: Bell, flag: 'can_view_notifications' },
  { href: '/portal/search/new', label: 'Research', icon: Telescope, flag: 'can_search' },
  { href: '/portal/ideas', label: 'Ideas', icon: Lightbulb, flag: 'can_submit_ideas' },
  { href: '/portal/calendar', label: 'Calendar', icon: Calendar, flag: 'can_view_calendar' },
  { href: '/portal/analyze', label: 'Analyze', icon: Microscope, flag: 'can_view_analyze' },
  { href: '/portal/knowledge', label: 'Knowledge', icon: Brain, flag: 'can_view_knowledge' },
  { href: '/portal/reports', label: 'Reports', icon: FileText, flag: 'can_view_reports' },
  { href: '/portal/preferences', label: 'Preferences', icon: Sliders, flag: 'can_edit_preferences' },
  { href: '/portal/settings', label: 'Settings', icon: Settings, flag: null },
];

interface PortalSidebarProps {
  userName?: string;
  avatarUrl?: string | null;
  featureFlags?: FeatureFlags;
}

export function PortalSidebar({ userName, avatarUrl, featureFlags }: PortalSidebarProps) {
  const pathname = usePathname();
  const { open, toggleSidebar } = useSidebar();

  const flags = featureFlags as Record<string, boolean> | undefined;
  const navItems = ALL_NAV_ITEMS.filter((item) => {
    if (!item.flag) return true;
    return flags?.[item.flag] !== false;
  });

  return (
    <Sidebar>
      <SidebarHeader>
        <Link
          href="/portal/dashboard"
          className={`flex items-center hover:opacity-80 transition-opacity duration-150 mb-3 ${
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
            <span className="text-[10px] font-bold text-text-secondary tracking-[0.3em] uppercase">
              Portal
            </span>
          )}
        </Link>

        {featureFlags?.can_search !== false && (
          <Link href="/portal/search/new">
            {open ? (
              <Button shape="pill" className="w-full">
                <Search size={16} />
                New search
              </Button>
            ) : (
              <Button shape="pill" className="w-full !px-0 justify-center">
                <Search size={16} />
              </Button>
            )}
          </Link>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {navItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/');
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
      </SidebarContent>

      <SidebarFooter>
        <button
          onClick={toggleSidebar}
          className={`flex items-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors mb-2 ${
            open ? 'gap-2 px-2.5 py-1.5 w-full text-xs' : 'w-full justify-center py-1.5'
          } cursor-pointer`}
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
