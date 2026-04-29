import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/auth/permissions';
import { ReviewBoard } from '@/components/scheduler/review-board';

export const dynamic = 'force-dynamic';

/**
 * Admin-only Review subpage. Mirrors the viewer route at /calendar/review
 * with the same component — `isAdmin` flips on the create-link CTA and the
 * per-card revoke / copy controls.
 */
export default async function AdminReviewPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  if (!(await isAdmin(user.id))) redirect('/calendar/review');

  return <ReviewBoard isAdmin createHref="/admin/calendar" />;
}
