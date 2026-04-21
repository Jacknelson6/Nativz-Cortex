import { redirect } from 'next/navigation';

/**
 * `/admin/tools` retired — each former sub-tool is now a first-class
 * `/admin/<name>` route (Users, Accounting, Notifications, AI settings)
 * reachable from the sidebar's "Admin" dropdown. Kept as a redirect so
 * stale bookmarks and any lingering internal `/admin/tools` links land
 * somewhere sensible instead of 404ing.
 */
export default function ToolsRetiredRedirect() {
  redirect('/admin/dashboard');
}
