import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Legacy admin URL — moved to root `/review` as part of the brand-root
 * migration. Kept as a thin redirect so existing bookmarks / nav code
 * pointing at `/admin/calendar/review` continue to work.
 */
export default function LegacyAdminReviewPage() {
  redirect('/review');
}
