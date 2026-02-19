'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { LogOut, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSidebar } from './sidebar-provider';

interface HeaderProps {
  userName?: string;
  portalMode?: boolean;
}

export function Header({ userName, portalMode = false }: HeaderProps) {
  const router = useRouter();
  const { isOpen, toggle } = useSidebar();

  async function handleLogout() {
    const res = await fetch('/api/auth/logout', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    router.push(data.redirectTo || (portalMode ? '/portal/login' : '/admin/login'));
    router.refresh();
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-nativz-border bg-surface px-4 md:px-6">
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
        <Image
          src="/nativz-logo.svg"
          alt="Nativz"
          width={93}
          height={36}
          className="h-7 w-auto"
          priority
        />
        <span className="text-xs font-medium text-text-secondary tracking-wide uppercase">
          Cortex
        </span>
        {portalMode && (
          <span className="rounded-full bg-accent-surface px-2 py-0.5 text-xs font-medium text-accent-text">
            Portal
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {userName && (
          <span className="hidden sm:inline text-sm text-text-muted">{userName}</span>
        )}
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          <LogOut size={16} />
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </div>
    </header>
  );
}
