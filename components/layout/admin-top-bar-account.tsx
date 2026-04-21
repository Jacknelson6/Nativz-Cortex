'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Code, LogOut, Settings, User } from 'lucide-react';

/**
 * Account cluster for the admin top bar — avatar button that opens a
 * below-anchored popover with Account settings, API docs, and Sign out.
 *
 * Distinct from <SidebarAccount/> which lives in the portal rail and has its
 * own above-anchored / side-anchored popover variants. This one is purpose-
 * built for a top-right anchor and renders inline (no portal needed —
 * nothing clips us up there).
 */
export function AdminTopBarAccount({
  userName,
  avatarUrl,
  settingsHref,
  apiDocsHref,
  logoutRedirect,
}: {
  userName?: string;
  avatarUrl?: string | null;
  settingsHref: string;
  apiDocsHref?: string;
  logoutRedirect: string;
}) {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
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
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={userName || 'Account'}
        className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full transition-colors ${
          open ? 'ring-2 ring-accent/40' : 'ring-1 ring-nativz-border hover:ring-accent/30'
        }`}
      >
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={userName || 'Profile'}
            width={36}
            height={36}
            className="h-full w-full object-cover"
          />
        ) : userName ? (
          <span className="bg-accent-surface text-accent-text h-full w-full flex items-center justify-center text-xs font-semibold">
            {initials}
          </span>
        ) : (
          <User size={15} className="text-text-secondary" />
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1.5 min-w-[200px] rounded-xl border border-nativz-border bg-surface p-1.5 shadow-elevated animate-[sidebarTooltipIn_120ms_ease-out_forwards]"
          style={{ backdropFilter: 'blur(16px)', zIndex: 60 }}
        >
          <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            {userName || 'Account'}
          </div>
          <Link
            href={settingsHref}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          >
            <Settings size={15} />
            Account settings
          </Link>
          {apiDocsHref && (
            <Link
              href={apiDocsHref}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
            >
              <Code size={15} />
              API docs
            </Link>
          )}
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-red-400 disabled:opacity-50"
          >
            <LogOut size={15} />
            {loggingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      )}
    </div>
  );
}
