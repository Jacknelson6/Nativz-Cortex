import { redirect } from 'next/navigation';

/**
 * `/admin/analytics/overview` mirrors the /benchmarking stub — overview is
 * the default sub-nav of /admin/analytics so just drop the segment.
 */
export default function OverviewAnalyticsRedirect() {
  redirect('/admin/analytics');
}
