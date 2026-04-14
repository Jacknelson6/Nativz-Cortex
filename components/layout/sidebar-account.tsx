'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Settings, LogOut, User, Eye } from 'lucide-react';

interface SidebarAccountProps {
  userName?: string;
  avatarUrl?: string | null;
  settingsHref: string;
  logoutRedirect: string;
  collapsed?: boolean;
  /** When set, renders a "Client view" menu item linking here. Used by the
   *  admin sidebar to let the team peek at the portal without losing the
   *  admin session. Omit for portal users. */
  clientViewHref?: string;
}

export function SidebarAccount({
  userName,
  avatarUrl,
  settingsHref,
  logoutRedirect,
  collapsed = false,
  clientViewHref,
}: SidebarAccountProps) {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
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

  return (
    <div ref={containerRef} className="relative">
      {open && (
        <div
          className={`absolute rounded-xl border border-nativz-border bg-surface p-1.5 shadow-elevated animate-[popIn_200ms_cubic-bezier(0.16,1,0.3,1)_forwards] ${
            collapsed ? 'left-full ml-2 bottom-0' : 'bottom-full mb-2 left-0 right-0'
          }`}
          style={{ backdropFilter: 'blur(16px)', zIndex: 50 }}
        >
          <Link
            href={settingsHref}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors whitespace-nowrap"
          >
            <Settings size={15} />
            Account settings
          </Link>
          {clientViewHref && (
            <Link
              href={clientViewHref}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors whitespace-nowrap"
            >
              <Eye size={15} />
              Client view
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
      )}

      <button
        onClick={() => setOpen((prev) => !prev)}
        className={`rounded-lg transition-colors ${
          collapsed ? 'flex h-9 w-9 mx-auto items-center justify-center' : 'flex w-full items-center gap-2.5 px-2.5 py-2'
        } ${open ? 'bg-surface-hover' : 'hover:bg-surface-hover'}`}
      >
        {/* Compact avatar — same h-7 w-7 footprint as nav icons so the
            footer stays the same height regardless of collapse state. */}
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full overflow-hidden bg-accent-surface">
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
        </div>

        {!collapsed && (
          <span className="flex-1 min-w-0 truncate text-left text-sm font-medium text-text-primary">
            {userName || 'Account'}
          </span>
        )}
      </button>
    </div>
  );
}
