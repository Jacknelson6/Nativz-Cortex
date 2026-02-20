'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, LogOut, ChevronUp, User } from 'lucide-react';

interface SidebarAccountProps {
  userName?: string;
  avatarUrl?: string | null;
  settingsHref: string;
  logoutRedirect: string;
}

export function SidebarAccount({
  userName,
  avatarUrl,
  settingsHref,
  logoutRedirect,
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
    <div ref={containerRef} className="relative p-3">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25, mass: 0.8 }}
            className="absolute bottom-full left-3 right-3 mb-2 rounded-xl border border-nativz-border bg-surface p-1.5 shadow-elevated"
            style={{ backdropFilter: 'blur(16px)' }}
          >
            <Link
              href={settingsHref}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
            >
              <Settings size={15} />
              Account settings
            </Link>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-text-secondary hover:bg-surface-hover hover:text-red-400 transition-colors disabled:opacity-50"
            >
              <LogOut size={15} />
              {loggingOut ? 'Signing out...' : 'Sign out'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        onClick={() => setOpen((prev) => !prev)}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className={`group flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-all duration-200 ${
          open
            ? 'border-accent/30 bg-accent-surface shadow-[0_0_12px_rgba(4,107,210,0.15)]'
            : 'border-transparent hover:border-nativz-border hover:bg-surface-hover'
        }`}
      >
        {/* Avatar */}
        <div className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-shadow duration-300 ${
          open ? 'shadow-[0_0_10px_rgba(4,107,210,0.3)]' : 'group-hover:shadow-[0_0_8px_rgba(4,107,210,0.2)]'
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
          {/* Ring */}
          <div className={`absolute inset-0 rounded-full border-2 transition-all duration-300 ${
            open
              ? 'border-accent/50'
              : 'border-transparent group-hover:border-accent/25'
          }`} />
        </div>

        {/* Name */}
        <div className="flex-1 min-w-0 text-left">
          <p className="truncate text-sm font-medium text-text-primary">
            {userName || 'Account'}
          </p>
        </div>

        {/* Chevron */}
        <motion.div
          animate={{ rotate: open ? 0 : 180 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        >
          <ChevronUp size={14} className="shrink-0 text-text-muted" />
        </motion.div>
      </motion.button>
    </div>
  );
}
