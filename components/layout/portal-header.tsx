'use client';

import { SidebarTrigger } from './sidebar';

export function PortalHeader() {
  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.06] bg-[#12141a]/90 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-[#12141a]/75 md:px-5">
      <SidebarTrigger className="h-9 w-9 rounded-lg border border-white/[0.06] bg-white/[0.03] text-text-secondary hover:border-white/[0.1] hover:bg-white/[0.06] hover:text-text-primary" />
      <span className="rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
        Portal
      </span>
    </header>
  );
}
