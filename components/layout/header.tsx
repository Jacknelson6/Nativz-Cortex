'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Menu, X } from 'lucide-react';
import { useSidebar } from './sidebar-provider';
import { NotificationBell } from './notification-bell';

interface HeaderProps {
  portalMode?: boolean;
}

export function Header({ portalMode = false }: HeaderProps) {
  const { isOpen, toggle } = useSidebar();

  return (
    <header className="flex h-16 items-center justify-between border-b border-nativz-border bg-background px-4 md:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted hover:bg-white/[0.06] hover:text-text-secondary transition-all md:hidden"
          aria-label={isOpen ? 'Close menu' : 'Open menu'}
        >
          <div className="relative h-5 w-5">
            <Menu
              size={20}
              className={`absolute inset-0 transition-all duration-200 ${
                isOpen ? 'rotate-90 opacity-0' : 'rotate-0 opacity-100'
              }`}
            />
            <X
              size={20}
              className={`absolute inset-0 transition-all duration-200 ${
                isOpen ? 'rotate-0 opacity-100' : '-rotate-90 opacity-0'
              }`}
            />
          </div>
        </button>
        <Link href="/" aria-label="Go to home" className="hidden md:flex flex-col items-center w-56 -ml-6 hover:opacity-80 transition-opacity duration-150">
          <Image
            src="/nativz-logo.svg"
            alt="Nativz"
            width={140}
            height={54}
            className="h-10 w-auto"
            priority
          />
          <span className="text-[11px] font-bold text-text-secondary tracking-[0.35em] uppercase -mt-1">
            Cortex
          </span>
        </Link>
        <Link href="/" aria-label="Go to home" className="flex md:hidden flex-col items-center hover:opacity-80 transition-opacity duration-150">
          <Image
            src="/nativz-logo.svg"
            alt="Nativz"
            width={140}
            height={54}
            className="h-10 w-auto"
            priority
          />
          <span className="text-[11px] font-bold text-text-secondary tracking-[0.35em] uppercase -mt-1">
            Cortex
          </span>
        </Link>
        {portalMode && (
          <span className="rounded-full bg-accent-surface px-2 py-0.5 text-xs font-medium text-accent-text">
            Portal
          </span>
        )}
      </div>
      <NotificationBell />
    </header>
  );
}
