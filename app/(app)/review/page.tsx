import { redirect } from 'next/navigation';
import { CalendarDays } from 'lucide-react';
import { getActiveBrand } from '@/lib/active-brand';
import { ReviewTable } from '@/components/scheduler/review-table';

export const dynamic = 'force-dynamic';

/**
 * Viewer (client-side) Review page at `/review`. Brand-scoped via the
 * active pill — clients see only their own brand's share-link inventory
 * as a table with a 4-stage progress track per row.
 *
 * Admins landing here get redirected to `/admin/calendar/review` (the
 * brand-scoped admin variant); the agency-wide oversight grid is at
 * `/admin/share-links`.
 */
export default async function ViewerReviewPage() {
  const active = await getActiveBrand().catch(() => null);
  if (active?.isAdmin) redirect('/admin/calendar/review');

  if (!active?.brand) {
    return (
      <div className="cortex-page-gutter mx-auto max-w-6xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-text-primary">Review</h1>
        </header>
        <div className="rounded-xl border border-nativz-border bg-surface p-12 text-center">
          <CalendarDays className="mx-auto mb-3 h-8 w-8 text-text-tertiary" />
          <p className="text-sm text-text-secondary">
            Pick a brand from the top bar to see your content reviews.
          </p>
        </div>
      </div>
    );
  }

  return <ReviewTable clientId={active.brand.id} brandName={active.brand.name} />;
}
