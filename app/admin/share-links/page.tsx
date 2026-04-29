import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/auth/permissions';
import { ReviewTable } from '@/components/scheduler/review-table';

export const dynamic = 'force-dynamic';

/**
 * Cross-brand share-link oversight tool. Same `<ReviewTable>` the
 * brand-scoped `/review` page uses — `clientId={null}` so every brand
 * is included, and a leading "Brand" column so rows can be told apart.
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
    <ReviewTable
      clientId={null}
      title="Share links"
      description="Every share link across every brand. Open one to see comments, approvals, and revision status. For a single brand, use Content → Review with that brand selected."
      showBrand
    />
  );
}
