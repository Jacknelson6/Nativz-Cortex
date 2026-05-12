import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { SectionHeader } from '@/components/admin/section-tabs';
import { fetchPublishHealthSnapshot } from '@/lib/ops/publish-health';
import { fetchRecentSlo } from '@/lib/ops/publish-slo';
import { PublishHealthDashboard } from '@/components/admin/ops/publish-health-dashboard';

export const dynamic = 'force-dynamic';

/**
 * Publish health ops dashboard (PUB-05). One glanceable view that pulls
 * together everything PUB-01..PUB-04 surface: per-platform success rate,
 * top failing clients, canary trend, and the last-24h failure table.
 *
 * Admin-only via the `/admin` layout guard. Data fetched server-side; the
 * client component handles the 7d/30d toggle and hover details locally.
 */
export default async function PublishHealthOpsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const [snapshot, sloRows] = await Promise.all([
    fetchPublishHealthSnapshot(admin),
    fetchRecentSlo(admin, 30),
  ]);

  return (
    <div className="cortex-page-gutter max-w-7xl mx-auto space-y-8 py-6">
      <SectionHeader title="Publish health" />
      <PublishHealthDashboard initialSnapshot={snapshot} sloRows={sloRows} />
    </div>
  );
}
