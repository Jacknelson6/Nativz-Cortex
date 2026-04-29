import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/auth/permissions';
import { ReviewBoard } from '@/components/scheduler/review-board';

export const dynamic = 'force-dynamic';

/**
 * Cross-brand share-link oversight tool. Renders the same `<ReviewBoard>`
 * component but **without a clientId filter** — every brand the admin
 * can see, in one bento grid. Each card shows the brand name so the
 * cross-brand context is obvious.
 *
 * Lives under Admin (not Content) because the brand-scoped review lives
 * at `/review` and follows the brand pill. This page is for "show me
 * everything pending across the agency right now".
 */
export default async function AdminShareLinksPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  if (!(await isAdmin(user.id))) redirect('/review');

  return (
    <ReviewBoard
      isAdmin
      clientId={null}
      createHref="/admin/calendar"
      title="Share links"
      description="Every share link across every brand. Open one to see comments, approvals, and revision status. For a single brand, use Content → Review with that brand selected."
      showBrandOnCards
    />
  );
}
