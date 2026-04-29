import { redirect } from 'next/navigation';
import { getActiveBrand } from '@/lib/active-brand';
import { ReviewBoard } from '@/components/scheduler/review-board';

export const dynamic = 'force-dynamic';

/**
 * Viewer Review subpage. Lives in the unified `(app)` shell, scoped via
 * the same `getActiveBrand()` helper that powers the calendar — admins
 * landing here are redirected to the admin variant so the create / revoke
 * controls stay where they're supposed to be.
 */
export default async function ViewerReviewPage() {
  const active = await getActiveBrand().catch(() => null);
  if (active?.isAdmin) redirect('/admin/calendar/review');

  return <ReviewBoard isAdmin={false} />;
}
