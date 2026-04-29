import { CalendarDays } from 'lucide-react';
import { getActiveBrand } from '@/lib/active-brand';
import { ReviewBoard } from '@/components/scheduler/review-board';
import { ReviewTable } from '@/components/scheduler/review-table';

export const dynamic = 'force-dynamic';

/**
 * Brand-scoped Review page. Lives at root `/review` (no /admin/ prefix —
 * Content is a brand-scoped section so its children match). Same URL
 * serves both roles; the body branches on `isAdmin`:
 *
 *   - admin  → bento grid via <ReviewBoard> with create / revoke / copy
 *              affordances. Cross-brand oversight stays on /admin/share-links.
 *   - viewer → table via <ReviewTable> with the 4-stage progress track
 *              tuned for client comprehension.
 *
 * Both surfaces are filtered by the active brand pill.
 */
export default async function ReviewPage() {
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
            Pick a brand from the top bar to see content reviews.
          </p>
        </div>
      </div>
    );
  }

  if (active.isAdmin) {
    return (
      <ReviewBoard
        isAdmin
        clientId={active.brand.id}
        createHref="/admin/calendar"
        description={`Share links you’ve sent for ${active.brand.name}. Open one to see comments, approvals, and revision status.`}
      />
    );
  }

  return <ReviewTable clientId={active.brand.id} brandName={active.brand.name} />;
}
