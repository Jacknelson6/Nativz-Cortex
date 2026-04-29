import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Legacy URL — Review now lives at top-level `/review` for both roles.
 * Kept as a thin redirect so existing bookmarks / share emails pointing
 * at `/calendar/review` continue to work.
 */
export default function LegacyCalendarReviewPage() {
  redirect('/review');
}
