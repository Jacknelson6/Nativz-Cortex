import { redirect } from 'next/navigation';
import { getActiveBrand } from '@/lib/active-brand';

export const dynamic = 'force-dynamic';

/**
 * Legacy viewer review URL — moved to top-level `/review`. Admins go to
 * the admin variant; viewers (and unauthenticated users, who'd hit the
 * login redirect upstream) bounce to `/review`.
 *
 * Kept as a thin redirect rather than deleted so existing share-link
 * emails / bookmarks pointing at `/calendar/review` continue to work.
 */
export default async function LegacyViewerReviewPage() {
  const active = await getActiveBrand().catch(() => null);
  if (active?.isAdmin) redirect('/admin/calendar/review');
  redirect('/review');
}
