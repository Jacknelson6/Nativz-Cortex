import { redirect } from 'next/navigation';
import { CalendarDays } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/auth/permissions';
import { getActiveBrand } from '@/lib/active-brand';
import { ReviewBoard } from '@/components/scheduler/review-board';

export const dynamic = 'force-dynamic';

/**
 * Admin Review subpage. Lives under the Content section and is **brand
 * scoped** — it shows only the share links for the brand currently in the
 * top-bar pill. The cross-brand oversight view (every brand's links in
 * one board) lives at `/admin/share-links`, surfaced from the Admin
 * dropdown.
 *
 * Why scoped: every other surface under Content (the calendar, the post
 * editor, drive imports) is brand-scoped. Having Review be the one
 * exception was confusing — when the pill says "SafeStop", admins now
 * expect Review to be SafeStop's links.
 */
export default async function AdminReviewPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  if (!(await isAdmin(user.id))) redirect('/calendar/review');

  const active = await getActiveBrand().catch(() => null);

  if (!active?.brand) {
    return (
      <div className="cortex-page-gutter mx-auto max-w-6xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-text-primary">Review</h1>
        </header>
        <div className="rounded-xl border border-nativz-border bg-surface p-12 text-center">
          <CalendarDays className="mx-auto mb-3 h-8 w-8 text-text-tertiary" />
          <p className="text-sm text-text-secondary">
            Pick a brand from the top bar to see its share links.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ReviewBoard
      isAdmin
      clientId={active.brand.id}
      createHref="/admin/calendar"
      description={`Share links you’ve sent for ${active.brand.name}. Open one to see comments, approvals, and revision status.`}
    />
  );
}
