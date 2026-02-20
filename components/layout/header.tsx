'use client';

import Image from 'next/image';
import { Menu, X } from 'lucide-react';
import { useSidebar } from './sidebar-provider';

interface HeaderProps {
  portalMode?: boolean;
}

export function Header({ portalMode = false }: HeaderProps) {
  const { isOpen, toggle } = useSidebar();

  return (
    <header className="flex h-16 items-center border-b border-nativz-border bg-surface px-4 md:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-all md:hidden"
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
        <div className="flex flex-col items-center -space-y-1">
          <Image
            src="/nativz-logo.svg"
            alt="Nativz"
            width={140}
            height={54}
            className="h-9 w-auto"
            priority
          />
          <span className="text-xs font-semibold text-text-secondary tracking-[0.25em] uppercase">
            Cortex
          </span>
        </div>
        {portalMode && (
          <span className="rounded-full bg-accent-surface px-2 py-0.5 text-xs font-medium text-accent-text">
            Portal
          </span>
        )}
      </div>
    </header>
  );
}
