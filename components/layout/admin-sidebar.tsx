'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Building2,
  UsersRound,
  Telescope,
  BarChart3,
  CheckSquare,
  Send,
  Workflow,
  BotMessageSquare,
  ChevronRight,
  Share2,
  Handshake,
  ImagePlus,
  StickyNote,
  Brain,
  Scissors,
  ThumbsUp,
  Megaphone,
  Camera,
  Compass,
} from 'lucide-react';
import { SidebarAccount } from '@/components/layout/sidebar-account';
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
      {
        href: '/admin/pipeline',
        label: 'Monthly pipeline',
        icon: Workflow,
        children: [
          { href: '/admin/pipeline', label: 'All stages', icon: Workflow },
          { href: '/admin/shoots', label: 'Shoot calendar', icon: Camera },
          { href: '/admin/pipeline?stage=editing', label: 'Editing', icon: Scissors },
          {
            href: '/admin/pipeline?stage=scheduling',
            label: 'Approvals & handoff',
            icon: ThumbsUp,
          },
          { href: '/admin/pipeline?stage=boosting', label: 'Boosting', icon: Megaphone },
        ],
      },
      { href: '/admin/scheduler', label: 'Post scheduler', icon: Send },
      { href: '/admin/search/new', label: 'Research', icon: Telescope },
      { href: '/admin/strategy-lab', label: 'Strategy lab', icon: Compass },
      { href: '/admin/ad-creatives', label: 'Ad creatives', icon: ImagePlus },
    ],
  },
  {
    label: 'Manage',
    items: [
      { href: '/admin/clients', label: 'Clients', icon: Building2 },
      { href: '/admin/team', label: 'Team', icon: UsersRound },
      { href: '/admin/presentations', label: 'Notes', icon: StickyNote },
      {
        href: '/admin/analytics',
        label: 'Analytics',
        icon: BarChart3,
        children: [
          { href: '/admin/analytics/social', label: 'Social media', icon: Share2 },
          { href: '/admin/analytics/affiliates', label: 'Affiliates', icon: Handshake },
        ],
      },
      { href: '/admin/knowledge', label: 'Knowledge', icon: Brain },
    ],
  },
];

function isActivePath(pathname: string, href: string, searchParams?: URLSearchParams) {
  if (href === '/admin/search/new') {
    return pathname.startsWith('/admin/search') || pathname.startsWith('/admin/ideas');
  }

  // Pipeline root "All stages" shares /admin/pipeline with ?stage=… filtered views
  if (href === '/admin/pipeline' && pathname === '/admin/pipeline') {
    return !searchParams?.get('stage');
  }

  // Knowledge: graph and meetings are one area (single sidebar item)
  if (href === '/admin/knowledge') {
    if (pathname === '/admin/meetings' || pathname.startsWith('/admin/meetings/')) return true;
    return pathname === '/admin/knowledge' || pathname.startsWith('/admin/knowledge/');
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

interface AdminSidebarProps {
  userName?: string;
  avatarUrl?: string | null;
}

export function AdminSidebar({ userName, avatarUrl }: AdminSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { open } = useSidebar();
  const { mode, toggleMode, isForced } = useBrandMode();
  const [showHiTooltip, setShowHiTooltip] = useState(false);
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
      {/* Logo — click toggles brand mode (Nativz ↔ Anderson Collaborative), or shows 'Hi there!' when forced */}
      <SidebarHeader>
        <div className="relative flex w-full items-center justify-center mb-3">
          <button
            type="button"
            onClick={(e) => {
              if (isForced) {
                setShowHiTooltip(true);
                setTimeout(() => setShowHiTooltip(false), 2000);
              } else {
                toggleMode(e);
              }
            }}
            aria-label={isForced ? 'Hi there!' : `Switch to ${mode === 'nativz' ? 'Anderson Collaborative' : 'Nativz'} mode`}
            className="flex w-full items-center justify-center hover:opacity-80 transition-all duration-200 cursor-pointer"
          >
            {mode === 'nativz' ? (
              <Image
                src="/nativz-logo.svg"
                alt="Nativz"
                width={open ? 120 : 28}
                height={open ? 46 : 10}
                className={`${open ? 'h-9 w-auto' : 'h-5 w-auto'} transition-opacity duration-200`}
                priority
              />
            ) : (
              <img
                src="/anderson-logo-dark.svg"
                alt="Anderson Collaborative"
                className={`${open ? 'h-9 w-auto' : 'h-5 w-auto'} transition-opacity duration-200`}
              />
            )}
          </button>

          {/* 'Hi there!' tooltip — shown on AC domain where toggle is locked */}
          {showHiTooltip && (
            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-50 animate-[popIn_150ms_cubic-bezier(0.16,1,0.3,1)_forwards]">
              <div className="rounded-lg border border-nativz-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary shadow-elevated whitespace-nowrap">
                Hi there! 👋
              </div>
              {/* Arrow */}
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 border-l border-t border-nativz-border bg-surface" />
            </div>
          )}
        </div>
      </SidebarHeader>

      {/* Navigation */}
      <SidebarContent>
        {NAV_SECTIONS.map((section, idx) => (
          <SidebarGroup key={section.label}>
            {open && (
              <span className="px-2.5 pb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
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
                        </div>
                      </div>
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
          settingsHref="/admin/settings"
          logoutRedirect="/admin/login"
          collapsed={!open}
        />

      </SidebarFooter>
    </Sidebar>
  );
}
