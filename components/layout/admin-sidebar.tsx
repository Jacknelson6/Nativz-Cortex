'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Building2,
  UsersRound,
  Search,
  BarChart3,
  CheckSquare,
  Send,
  Workflow,
  Sparkles,
  BotMessageSquare,
  ChevronRight,
  Share2,
  Handshake,
} from 'lucide-react';
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

// ---------------------------------------------------------------------------
// Nav config
// ---------------------------------------------------------------------------

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  children?: { href: string; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[];
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Overview',
    items: [
      { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/admin/tasks', label: 'Tasks', icon: CheckSquare },
    ],
  },
  {
    label: 'Content',
    items: [
      { href: '/admin/pipeline', label: 'Pipeline', icon: Workflow },
      { href: '/admin/scheduler', label: 'Scheduler', icon: Send },
      { href: '/admin/ideas', label: 'Ideas', icon: Sparkles },
      { href: '/admin/search/new', label: 'Search', icon: Search },
    ],
  },
  {
    label: 'Manage',
    items: [
      { href: '/admin/clients', label: 'Clients', icon: Building2 },
      { href: '/admin/team', label: 'Team', icon: UsersRound },
      {
        href: '/admin/analytics',
        label: 'Analytics',
        icon: BarChart3,
        children: [
          { href: '/admin/analytics/social', label: 'Social media', icon: Share2 },
          { href: '/admin/analytics/affiliates', label: 'Affiliates', icon: Handshake },
        ],
      },
    ],
  },
];

function isActivePath(pathname: string, href: string) {
  if (href === '/admin/search/new') {
    return pathname.startsWith('/admin/search');
  }
  if (href === '/admin/ideas') {
    return pathname.startsWith('/admin/ideas');
  }
  return pathname === href || pathname.startsWith(href + '/');
}

// ---------------------------------------------------------------------------
// AdminSidebar
// ---------------------------------------------------------------------------

interface AdminSidebarProps {
  userName?: string;
  avatarUrl?: string | null;
}

export function AdminSidebar({ userName, avatarUrl }: AdminSidebarProps) {
  const pathname = usePathname();
  const { open } = useSidebar();
  const [showNativz, setShowNativz] = useState(true);

  return (
    <Sidebar>
      {/* Logo — click toggles between Nativz+Cortex and just Cortex */}
      <SidebarHeader>
        <button
          type="button"
          onClick={() => setShowNativz((v) => !v)}
          className={`flex w-full items-center justify-center hover:opacity-80 transition-all duration-200 mb-3 cursor-pointer ${
            open ? 'flex-col -space-y-0.5' : ''
          }`}
        >
          {showNativz ? (
            <>
              <Image
                src="/nativz-logo.svg"
                alt="Nativz"
                width={open ? 90 : 28}
                height={open ? 34 : 10}
                className={`${open ? 'h-7 w-auto' : 'h-5 w-auto'} transition-opacity duration-200`}
                priority
              />
              {open && (
                <span className="text-[10px] font-bold text-text-secondary tracking-[0.3em] uppercase">
                  Cortex
                </span>
              )}
            </>
          ) : (
            <span className={`font-bold tracking-[0.2em] uppercase transition-opacity duration-200 ${
              open ? 'text-lg text-text-primary' : 'text-[10px] text-text-secondary'
            }`}>
              Cortex
            </span>
          )}
        </button>

      </SidebarHeader>

      {/* Navigation */}
      <SidebarContent>
        {NAV_SECTIONS.map((section, idx) => (
          <SidebarGroup key={section.label}>
            {open && (
              <span className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                {section.label}
              </span>
            )}
            {!open && idx > 0 && <SidebarSeparator />}
            <SidebarMenu>
              {section.items.map((item) => {
                const active = isActivePath(pathname, item.href);

                if (item.children && open) {
                  const childActive = item.children.some((c) => isActivePath(pathname, c.href));
                  return (
                    <SidebarMenuItem key={item.href}>
                      <Link href={item.children[0].href}>
                        <SidebarMenuButton isActive={active || childActive} tooltip={item.label}>
                          <item.icon size={18} className="shrink-0" />
                          <span className="truncate">{item.label}</span>
                          <ChevronRight size={14} className={`ml-auto shrink-0 transition-transform duration-200 ${childActive || active ? 'rotate-90' : ''}`} />
                        </SidebarMenuButton>
                      </Link>
                      {(childActive || active) && (
                        <ul className="ml-6 mt-0.5 space-y-0.5 border-l border-nativz-border pl-2">
                          {item.children.map((child) => {
                            const cActive = isActivePath(pathname, child.href);
                            return (
                              <li key={child.href}>
                                <Link
                                  href={child.href}
                                  className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                                    cActive
                                      ? 'text-accent-text bg-accent-surface'
                                      : 'text-text-muted hover:text-text-secondary hover:bg-surface-hover'
                                  }`}
                                >
                                  <child.icon size={14} className="shrink-0" />
                                  <span className="truncate">{child.label}</span>
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </SidebarMenuItem>
                  );
                }

                return (
                  <SidebarMenuItem key={item.href}>
                    <Link href={item.children ? item.children[0].href : item.href}>
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
        <div className="px-1 pb-2">
          <Link
            href="/admin/nerd"
            className={`group/nerd relative block overflow-hidden rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-transform duration-200 ${open ? '' : 'rounded-lg'}`}
            style={{ padding: '1px 0' }}
          >
            {/* Orbiting star — bottom */}
            <div
              className="absolute w-[300%] h-[50%] opacity-70 group-hover/nerd:opacity-100 bottom-[-11px] right-[-250%] rounded-full z-0 transition-opacity duration-300"
              style={{
                background: 'radial-gradient(circle, #5ba3e6, transparent 10%)',
                animation: 'star-movement-bottom 6s linear infinite alternate',
              }}
            />
            {/* Orbiting star — top */}
            <div
              className="absolute w-[300%] h-[50%] opacity-70 group-hover/nerd:opacity-100 top-[-10px] left-[-250%] rounded-full z-0 transition-opacity duration-300"
              style={{
                background: 'radial-gradient(circle, #046bd2, transparent 10%)',
                animation: 'star-movement-top 6s linear infinite alternate',
              }}
            />

            <div
              className={`relative z-[1] flex items-center border border-white/[0.06] bg-gradient-to-b from-surface to-[#0d0d14] transition-all duration-200 group-hover/nerd:shadow-[0_0_20px_rgba(4,107,210,0.2)] ${
                open ? 'gap-2.5 rounded-xl px-3 py-2.5' : 'justify-center rounded-lg px-2 py-2.5'
              } ${
                isActivePath(pathname, '/admin/nerd')
                  ? 'border-accent/30 shadow-[0_0_16px_rgba(4,107,210,0.15)]'
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
          settingsHref="/admin/settings"
          logoutRedirect="/admin/login"
          collapsed={!open}
        />

      </SidebarFooter>
    </Sidebar>
  );
}
