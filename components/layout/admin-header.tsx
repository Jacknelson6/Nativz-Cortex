'use client';

import { NotificationBell } from './notification-bell';
import { AdminTopBarAccount } from './admin-top-bar-account';

/**
 * Portal top header. Admin routes use <AdminTopBar/> (wraps the sidebar +
 * content with a full-width bar); portal keeps this lighter sticky header
 * inside SidebarInset. Both render the same right-edge cluster:
 * <NotificationBell/> + avatar popover (settings, optional API docs, sign
 * out). Account lives up here rather than in the sidebar footer so the
 * rail stays pure navigation.
 */
export function AdminHeader({
  userName,
  avatarUrl,
  settingsHref,
  apiDocsHref,
  logoutRedirect,
}: {
  userName?: string;
  avatarUrl?: string | null;
  settingsHref?: string;
  apiDocsHref?: string;
  logoutRedirect?: string;
} = {}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-end gap-2 border-b border-nativz-border bg-surface px-4">
      <NotificationBell />
      {settingsHref && logoutRedirect && (
        <AdminTopBarAccount
          userName={userName}
          avatarUrl={avatarUrl}
          settingsHref={settingsHref}
          apiDocsHref={apiDocsHref}
          logoutRedirect={logoutRedirect}
        />
      )}
    </header>
  );
}
