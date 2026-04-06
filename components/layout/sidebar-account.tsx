'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Settings, LogOut, User, Key, Cpu } from 'lucide-react';

interface SidebarAccountProps {
  userName?: string;
  avatarUrl?: string | null;
  settingsHref: string;
  logoutRedirect: string;
  collapsed?: boolean;
}

export function SidebarAccount({
  userName,
  avatarUrl,
  settingsHref,
  logoutRedirect,
  collapsed = false,
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
    <div ref={containerRef} className={`relative ${collapsed ? 'p-2' : 'p-3'}`}>
      {open && (
        <div
          className={`absolute rounded-xl border border-nativz-border bg-surface p-1.5 shadow-elevated animate-[popIn_200ms_cubic-bezier(0.16,1,0.3,1)_forwards] ${
            collapsed ? 'left-full ml-2 bottom-0' : 'bottom-full mb-2 left-3 right-3'
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
          {!settingsHref.startsWith('/portal') && (
            <>
              <Link
                href="/admin/nerd/api"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors whitespace-nowrap"
              >
                <Key size={15} />
                API docs
              </Link>
              <Link
                href="/admin/settings/usage"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors whitespace-nowrap"
              >
                <Cpu size={15} />
                AI models
              </Link>
            </>
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
        className={`group flex w-full items-center rounded-xl border transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${
          collapsed ? 'justify-center px-0 py-2.5' : 'gap-2.5 px-3 py-2.5'
        } ${
          open
            ? 'border-accent/30 bg-accent-surface shadow-[0_0_12px_var(--accent-surface)]'
            : 'border-transparent hover:border-nativz-border hover:bg-surface-hover'
        }`}
      >
        {/* Avatar */}
        <div className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-shadow duration-300 ${
          open ? 'shadow-[0_0_10px_var(--accent-surface)]' : 'group-hover:shadow-[0_0_8px_var(--accent-surface)]'
        }`}>
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt={userName || 'Profile'}
              width={32}
              height={32}
              className="rounded-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-full bg-accent-surface">
              {userName ? (
                <span className="text-xs font-semibold text-accent-text">{initials}</span>
              ) : (
                <User size={14} className="text-accent-text" />
              )}
            </div>
          )}
          <div className={`absolute inset-0 rounded-full border-2 transition-all duration-300 ${
            open
              ? 'border-accent/50'
              : 'border-transparent group-hover:border-accent/25'
          }`} />
        </div>

        {/* Name + Chevron — hidden when collapsed */}
        {!collapsed && (
          <>
            <div className="flex-1 min-w-0 text-left">
              <p className="truncate text-sm font-medium text-text-primary">
                {userName || 'Account'}
              </p>
            </div>
          </>
        )}
      </button>
    </div>
  );
}
