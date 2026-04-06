'use client';

import { NotificationBell } from './notification-bell';

export function AdminHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-end border-b border-nativz-border bg-surface px-4">
      <NotificationBell />
    </header>
  );
}
