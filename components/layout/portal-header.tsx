'use client';

import { SidebarTrigger } from './sidebar';

export function PortalHeader() {
  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b border-nativz-border bg-surface px-4 md:px-5">
      <SidebarTrigger className="h-9 w-9 rounded-lg border border-nativz-border bg-background text-text-secondary hover:bg-surface-hover hover:text-text-primary" />
      <span className="rounded-md border border-nativz-border bg-background/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
        Portal
      </span>
    </header>
  );
}
