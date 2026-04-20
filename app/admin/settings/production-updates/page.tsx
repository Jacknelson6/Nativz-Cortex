import { redirect } from 'next/navigation';

/**
 * Production updates moved to /admin/tools/email (renamed to cover all mass
 * correspondence — launches, bug alerts, etc.). Redirect kept for stale links.
 */
export default function ProductionUpdatesRedirect() {
  redirect('/admin/tools/email');
}
