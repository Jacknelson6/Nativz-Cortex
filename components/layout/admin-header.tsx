'use client';

import { NotificationBell } from './notification-bell';

export function AdminHeader() {
  return (
    <header className="flex h-14 items-center justify-end border-b border-nativz-border bg-surface px-4">
      <NotificationBell />
    </header>
  );
}
