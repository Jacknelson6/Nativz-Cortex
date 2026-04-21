import { redirect } from 'next/navigation';

/**
 * `/admin/analytics/benchmarking` used to 404 — turns out the analytics
 * landing hosts every tab/sub-nav behind query params, not nested routes.
 * Redirect keeps stale bookmarks, internal links, and external comms
 * landing somewhere useful instead of the 404 page.
 */
export default function BenchmarkingAnalyticsRedirect() {
  redirect('/admin/analytics?tab=social&sub=benchmarking');
}
