import { redirect } from 'next/navigation';

/**
 * Production updates merged into the Notifications Hub. Redirect kept for
 * stale share links + bookmarks.
 */
export default function ProductionUpdatesRedirect() {
  redirect('/admin/notifications');
}
