import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Legacy admin calendar URL. The canonical path is now `/calendar` —
 * same URL serves admin and viewer with role-aware content. Kept here
 * as a permanent redirect so existing bookmarks, OAuth callbacks, and
 * external links keep working.
 */
export default function LegacyAdminCalendarPage() {
  redirect('/calendar');
}
