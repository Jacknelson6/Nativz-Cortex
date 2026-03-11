'use client';

import { SidebarTrigger } from './sidebar';

export function PortalHeader() {
  return (
    <header className="flex h-14 items-center justify-between border-b border-nativz-border bg-surface px-4">
      <div className="flex items-center gap-2">
        <SidebarTrigger />
        <span className="rounded-full bg-accent-surface px-2 py-0.5 text-xs font-medium text-accent-text">
          Portal
        </span>
      </div>
    </header>
  );
}
