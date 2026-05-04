import { redirect } from 'next/navigation';

/**
 * Production updates merged into the Notifications Hub. Redirect kept for
 * stale share links + bookmarks. The hub itself moved into Settings on
 * 2026-05-03; pointing directly at the new home avoids a double-hop.
 */
export default function ProductionUpdatesRedirect() {
  redirect('/admin/settings?tab=notifications');
}
