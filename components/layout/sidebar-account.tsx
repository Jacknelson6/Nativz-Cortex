'use client';

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Settings, LogOut, User, Code } from 'lucide-react';

interface SidebarAccountProps {
  userName?: string;
  avatarUrl?: string | null;
  settingsHref: string;
  logoutRedirect: string;
  collapsed?: boolean;
  /** When set, renders an "API docs" menu item linking here. Admin-only;
   *  omit for portal users. */
  apiDocsHref?: string;
}

export function SidebarAccount({
  userName,
  avatarUrl,
  settingsHref,
  logoutRedirect,
  collapsed = false,
  apiDocsHref,
}: SidebarAccountProps) {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Position popover via fixed coords anchored to the avatar button so the
  // sidebar's overflow-hidden clip doesn't swallow it.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    function updateCoords() {
      const btn = buttonRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      if (collapsed) {
        setCoords({ top: r.bottom, left: r.right + 8, width: 0 });
      } else {
        setCoords({ top: r.top, left: r.left, width: r.width });
      }
    }
    updateCoords();
    window.addEventListener('resize', updateCoords);
    window.addEventListener('scroll', updateCoords, true);
    return () => {
      window.removeEventListener('resize', updateCoords);
      window.removeEventListener('scroll', updateCoords, true);
    };
  }, [open, collapsed]);

  // Close on click outside (checks the portal-rendered popover too)
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      const inButton = containerRef.current?.contains(target);
      const inPopover = popoverRef.current?.contains(target);
      if (!inButton && !inPopover) setOpen(false);
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open]);

  async function handleLogout() {
    setLoggingOut(true);
    const res = await fetch('/api/auth/logout', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    router.push(data.redirectTo || logoutRedirect);
    router.refresh();
  }

  const initials = userName
    ? userName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  const popoverNode = open && mounted && coords ? (
    <div
      ref={popoverRef}
      className="fixed rounded-xl border border-nativz-border bg-surface p-1.5 shadow-elevated animate-[popIn_200ms_cubic-bezier(0.16,1,0.3,1)_forwards]"
      style={{
        top: collapsed ? coords.top : undefined,
        bottom: collapsed ? undefined : window.innerHeight - coords.top + 8,
        left: coords.left,
        transform: collapsed ? 'translateY(-100%)' : undefined,
        minWidth: collapsed ? undefined : coords.width,
        backdropFilter: 'blur(16px)',
        zIndex: 1000,
      }}
    >
      <Link
        href={settingsHref}
        onClick={() => setOpen(false)}
        className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors whitespace-nowrap"
      >
        <Settings size={15} />
        Account settings
      </Link>
      {apiDocsHref && (
        <Link
          href={apiDocsHref}
          onClick={() => setOpen(false)}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors whitespace-nowrap"
        >
          <Code size={15} />
          API docs
        </Link>
      )}
      <button
        onClick={handleLogout}
        disabled={loggingOut}
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-text-secondary hover:bg-surface-hover hover:text-red-400 transition-colors disabled:opacity-50 whitespace-nowrap"
      >
        <LogOut size={15} />
        {loggingOut ? 'Signing out...' : 'Sign out'}
      </button>
    </div>
  ) : null;

  return (
    <div ref={containerRef} className="relative">
      {popoverNode && createPortal(popoverNode, document.body)}

      <button
        ref={buttonRef}
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center min-h-[40px]"
      >
        <span
          className={`flex items-center rounded-md px-2 py-1.5 transition-colors ${
            !collapsed ? 'w-full' : ''
          } ${open ? 'bg-surface-hover' : 'hover:bg-surface-hover'}`}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full overflow-hidden bg-accent-surface">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={userName || 'Profile'}
                width={28}
                height={28}
                className="h-full w-full object-cover"
              />
            ) : userName ? (
              <span className="text-xs font-semibold text-accent-text">{initials}</span>
            ) : (
              <User size={13} className="text-accent-text" />
            )}
          </span>
          <span
            className={`overflow-hidden whitespace-nowrap text-left text-sm font-medium text-text-primary transition-[max-width,margin,opacity] duration-200 ease-out ${
              !collapsed ? 'max-w-[160px] ml-2.5 opacity-100' : 'max-w-0 ml-0 opacity-0'
            }`}
          >
            {userName || 'Account'}
          </span>
        </span>
      </button>
    </div>
  );
}
