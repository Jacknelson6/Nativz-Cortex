'use client';

import Image from 'next/image';
import { AdminBrandPill } from '@/components/layout/admin-brand-pill';
import { NotificationBell } from '@/components/layout/notification-bell';
import { useBrandMode } from '@/components/layout/brand-mode-provider';
import { AdminTopBarAccount } from '@/components/layout/admin-top-bar-account';

/**
 * Full-width top bar for admin routes. Sits above the sidebar + main content
 * (not inside either), matching the RankPrompt pattern: the product logo
 * anchors the top-left, the attached-brand pill sits immediately to its
 * right, and global actions (notifications, account menu) hug the right edge.
 *
 * The account menu (avatar → Account settings / API docs / Sign out) lives
 * up here rather than in the sidebar footer so the rail stays pure tool-
 * navigation. Portal users still see the account popover in their sidebar
 * rail — portal doesn't render this top bar.
 */
export function AdminTopBar({
  userName,
  avatarUrl,
  settingsHref,
  apiDocsHref,
  logoutRedirect,
}: {
  userName?: string;
  avatarUrl?: string | null;
  settingsHref: string;
  apiDocsHref?: string;
  logoutRedirect: string;
}) {
  const { mode } = useBrandMode();

  return (
    // NAT-57 bug hunt (2026-04-21): Jack hit an intermittent where the
    // top bar collapsed to 0px after client-side navigation, most
    // reliably when opening /lab. Belt-and-suspenders:
    //   - h-14 sets the 56px height
    //   - min-h-14 asserts it as a MIN — flex can't squeeze below even
    //     if a child's layout calc is off
    //   - shrink-0 prevents the flex-col parent from shrinking it when
    //     content below overfills
    // Any one of these should be enough, but we want three belts on
    // this particular pair of pants.
    <header className="flex h-14 min-h-14 shrink-0 items-center gap-3 border-b border-nativz-border bg-surface px-3">
      {/* Product logo — agency-aware so Anderson deployments pick up AC mark. */}
      <div className="flex h-9 shrink-0 items-center">
        {mode === 'nativz' ? (
          <Image
            src="/nativz-logo.png"
            alt="Nativz"
            width={120}
            height={32}
            className="h-7 w-auto"
            priority
          />
        ) : (
          // Preloaded from app/layout.tsx — hints below keep priority aligned.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/anderson-logo-dark.svg"
            alt="Anderson Collaborative"
            className="h-7 w-auto"
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
        )}
      </div>

      {/* Brand pill — fixed max width so the bar doesn't overflow on long brand names */}
      <div className="min-w-0 max-w-xs">
        <AdminBrandPill />
      </div>

      {/* Spacer pushes right-side actions to the edge */}
      <div className="flex-1" />

      {/* Right: global actions */}
      <div className="flex items-center gap-2">
        <NotificationBell />
        <AdminTopBarAccount
          userName={userName}
          avatarUrl={avatarUrl}
          settingsHref={settingsHref}
          apiDocsHref={apiDocsHref}
          logoutRedirect={logoutRedirect}
        />
      </div>
    </header>
  );
}
