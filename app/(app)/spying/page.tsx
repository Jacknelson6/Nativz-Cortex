import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveBrand } from '@/lib/active-brand';
import { SpyingPageHeader } from '@/components/spying/page-header';
import { AuditQuickStart } from '@/components/spying/audit-quick-start';
import { SpyStatStrip } from '@/components/spying/spy-stat-strip';
import { LatestAuditsList } from '@/components/spying/latest-audits-list';
import { WatchedCompetitorsList } from '@/components/spying/watched-competitors-list';
import { RecurringReportsPreview } from '@/components/spying/recurring-reports-preview';
import { SpyToolRail } from '@/components/spying/spy-tool-rail';

export const dynamic = 'force-dynamic';

type ProspectDataShape = {
  name?: string;
  displayName?: string;
  website?: string;
  favicon?: string;
} | null;

function compactNumber(n: number | null | undefined): string {
  if (n == null) return '0';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default async function CompetitorIntelligencePage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  if (me?.role !== 'admin' && !me?.is_super_admin) {
    redirect('/finder/new');
  }

  const { brand } = await getActiveBrand();

  // eslint-disable-next-line react-hooks/purity -- async server component, not re-rendered
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Brand-scope: when an admin has a working brand selected, every list/count
  // filters to that brand's competitors only. With no brand (super-admin
  // global view), all queries fall back to the unscoped portfolio rollup.
  let brandBenchmarkIds: string[] | null = null;
  if (brand) {
    const { data: benchRows } = await admin
      .from('client_benchmarks')
      .select('id')
      .eq('client_id', brand.id)
      .eq('is_active', true);
    brandBenchmarkIds = (benchRows ?? []).map((r) => r.id);
  }

  let auditsQuery = admin
    .from('prospect_audits')
    .select(
      'id, status, created_at, prospect_data, attached_client:attached_client_id(name)',
    )
    .order('created_at', { ascending: false })
    .limit(8);
  if (brand) auditsQuery = auditsQuery.eq('attached_client_id', brand.id);

  let benchmarksQuery = admin
    .from('client_benchmarks')
    .select(
      'id, client_id, cadence, last_snapshot_at, is_active, client:clients(name, logo_url, agency)',
    )
    .eq('is_active', true)
    .order('last_snapshot_at', { ascending: false, nullsFirst: false })
    .limit(12);
  if (brand) benchmarksQuery = benchmarksQuery.eq('client_id', brand.id);

  let auditCountQuery = admin
    .from('prospect_audits')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', sevenDaysAgo);
  if (brand) auditCountQuery = auditCountQuery.eq('attached_client_id', brand.id);

  // Skip the snapshot count when brand-scoped to zero benchmarks — `.in('col', [])`
  // is unreliable across PostgREST versions.
  const snapshotCountPromise: Promise<{ count: number | null }> = (async () => {
    if (brandBenchmarkIds !== null && brandBenchmarkIds.length === 0) {
      return { count: 0 };
    }
    let q = admin
      .from('benchmark_snapshots')
      .select('benchmark_id', { count: 'exact', head: true })
      .gte('captured_at', sevenDaysAgo);
    if (brandBenchmarkIds !== null) q = q.in('benchmark_id', brandBenchmarkIds);
    const result = await q;
    return { count: result.count };
  })();

  let activeWatchQuery = admin
    .from('client_benchmarks')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true);
  if (brand) activeWatchQuery = activeWatchQuery.eq('client_id', brand.id);

  let subscriptionsQuery = admin
    .from('competitor_report_subscriptions')
    .select(
      'id, client_id, cadence, recipients, include_portal_users, enabled, last_run_at, next_run_at, client:clients(name, agency)',
    )
    .order('next_run_at', { ascending: true });
  if (brand) subscriptionsQuery = subscriptionsQuery.eq('client_id', brand.id);

  const [
    auditsResult,
    benchmarksResult,
    auditCount7dResult,
    snapshotCount7dResult,
    activeWatchCountResult,
    subscriptionsResult,
  ] = await Promise.all([
    auditsQuery,
    benchmarksQuery,
    auditCountQuery,
    snapshotCountPromise,
    activeWatchQuery,
    subscriptionsQuery,
  ]);

  const audits = (auditsResult.data ?? []).map((a) => {
    const attached = Array.isArray(a.attached_client) ? a.attached_client[0] : a.attached_client;
    const prospect = a.prospect_data as ProspectDataShape;
    return {
      id: a.id,
      status: a.status,
      created_at: a.created_at,
      brand_name: prospect?.displayName ?? prospect?.name ?? attached?.name ?? 'Untitled audit',
      website: prospect?.website ?? null,
      favicon: prospect?.favicon ?? null,
    };
  });

  const benchmarkIds = (benchmarksResult.data ?? []).map((b) => b.id);
  const { data: snaps } = benchmarkIds.length
    ? await admin
        .from('benchmark_snapshots')
        .select('benchmark_id, platform, username, display_name, followers, captured_at')
        .in('benchmark_id', benchmarkIds)
        .order('captured_at', { ascending: false })
        .limit(200)
    : { data: [] };

  const snapsByBenchmark = new Map<
    string,
    Array<{
      followers: number | null;
      captured_at: string;
      platform: string;
      username: string;
      display_name: string | null;
    }>
  >();
  for (const row of snaps ?? []) {
    const list = snapsByBenchmark.get(row.benchmark_id) ?? [];
    list.push(row);
    snapsByBenchmark.set(row.benchmark_id, list);
  }

  const watches = (benchmarksResult.data ?? []).map((b) => {
    const client = Array.isArray(b.client) ? b.client[0] : b.client;
    const snapsForB = snapsByBenchmark.get(b.id) ?? [];
    const latest = snapsForB[0];
    const firstFollowers = snapsForB[snapsForB.length - 1]?.followers ?? null;
    const latestFollowers = latest?.followers ?? null;
    const deltaPct =
      latestFollowers != null && firstFollowers != null && firstFollowers > 0
        ? (latestFollowers - firstFollowers) / firstFollowers
        : null;
    return {
      id: b.id,
      client_id: b.client_id,
      client_name: client?.name ?? 'Untitled client',
      client_logo: client?.logo_url ?? null,
      cadence: b.cadence as string,
      last_snapshot_at: b.last_snapshot_at,
      platform: latest?.platform ?? null,
      handle: latest?.username ?? null,
      display_name: latest?.display_name ?? null,
      followers: latestFollowers,
      delta_pct: deltaPct,
      series: snapsForB
        .slice(0, 12)
        .reverse()
        .map((s) => s.followers ?? 0),
    };
  });

  const subscriptions = (subscriptionsResult.data ?? []).map((s) => {
    const client = Array.isArray(s.client) ? s.client[0] : s.client;
    return {
      id: s.id,
      client_id: s.client_id,
      cadence: s.cadence as 'weekly' | 'biweekly' | 'monthly',
      recipients: s.recipients ?? [],
      include_portal_users: s.include_portal_users,
      enabled: s.enabled,
      last_run_at: s.last_run_at,
      next_run_at: s.next_run_at,
      client_name: client?.name ?? 'Untitled client',
      client_agency: client?.agency ?? null,
    };
  });

  const auditCount7d = auditCount7dResult.count ?? 0;
  const snapshotCount7d = snapshotCount7dResult.count ?? 0;
  const activeWatchCount = activeWatchCountResult.count ?? 0;
  const subscriptionTotal = subscriptions.length;

  const stats = [
    {
      label: 'Audits · 7d',
      value: compactNumber(auditCount7d),
      hint: auditCount7d === 0 ? 'Run one above' : 'Brand scorecards',
    },
    {
      label: 'Active watches',
      value: compactNumber(activeWatchCount),
      hint: activeWatchCount === 0 ? 'No competitors enrolled' : 'Tracked competitors',
    },
    {
      label: 'Snapshots · 7d',
      value: compactNumber(snapshotCount7d),
      hint: 'Across all platforms',
    },
    {
      label: 'Recurring reports',
      value: compactNumber(subscriptionTotal),
      hint: subscriptionTotal === 0 ? 'None scheduled' : 'On a cadence',
    },
  ];

  return (
    <div className="cortex-page-gutter mx-auto max-w-6xl space-y-8">
      <SpyingPageHeader />
      <AuditQuickStart />
      <SpyStatStrip stats={stats} />
      <LatestAuditsList audits={audits} />
      <WatchedCompetitorsList watches={watches} />
      <RecurringReportsPreview subscriptions={subscriptions} totalCount={subscriptionTotal} />
      <SpyToolRail />
    </div>
  );
}
