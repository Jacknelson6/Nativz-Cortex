import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { CompetitorIntelligenceHero } from '@/components/spying/landing-hero';
import { CompetitorIntelligenceActionBand } from '@/components/spying/action-band';
import { LatestAuditsStrip } from '@/components/spying/latest-audits-strip';
import { ActiveWatchesStrip } from '@/components/spying/active-watches-strip';

export const dynamic = 'force-dynamic';

type ProspectDataShape = {
  name?: string;
  displayName?: string;
  website?: string;
  favicon?: string;
} | null;

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
    redirect('/admin/dashboard');
  }

  const [auditsResult, benchmarksResult] = await Promise.all([
    admin
      .from('prospect_audits')
      .select(
        'id, status, created_at, prospect_data, scorecard, attached_client:attached_client_id(name)',
      )
      .order('created_at', { ascending: false })
      .limit(8),
    admin
      .from('client_benchmarks')
      .select(
        'id, client_id, cadence, last_snapshot_at, next_snapshot_due_at, is_active, client:clients(name, logo_url, agency)',
      )
      .eq('is_active', true)
      .order('last_snapshot_at', { ascending: false, nullsFirst: false })
      .limit(12),
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
      scorecard: a.scorecard as Record<string, unknown> | null,
    };
  });

  // Pull the last ~6 snapshots per benchmark for sparklines.
  const benchmarkIds = (benchmarksResult.data ?? []).map((b) => b.id);
  const { data: snaps } = benchmarkIds.length
    ? await admin
        .from('benchmark_snapshots')
        .select('benchmark_id, platform, username, display_name, followers, captured_at')
        .in('benchmark_id', benchmarkIds)
        .order('captured_at', { ascending: false })
        .limit(200)
    : { data: [] };

  const snapsByBenchmark = new Map<string, Array<{ followers: number | null; captured_at: string; platform: string; username: string; display_name: string | null }>>();
  for (const row of snaps ?? []) {
    const list = snapsByBenchmark.get(row.benchmark_id) ?? [];
    list.push(row);
    snapsByBenchmark.set(row.benchmark_id, list);
  }

  const watches = (benchmarksResult.data ?? []).map((b) => {
    const client = Array.isArray(b.client) ? b.client[0] : b.client;
    const snapsForB = snapsByBenchmark.get(b.id) ?? [];
    // Use the first (most recent) snapshot to label the watch.
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

  return (
    <div className="cortex-page-gutter max-w-6xl mx-auto space-y-12">
      <CompetitorIntelligenceHero />
      <CompetitorIntelligenceActionBand />
      <LatestAuditsStrip audits={audits} />
      <ActiveWatchesStrip watches={watches} />
      <FooterLinks />
    </div>
  );
}

function FooterLinks() {
  return (
    <footer className="flex flex-wrap gap-x-6 gap-y-2 border-t border-nativz-border/60 pt-6 text-xs text-text-muted">
      <Link
        href="/admin/competitor-tracking/tiktok-shop"
        className="hover:text-cyan-300"
      >
        Legacy TikTok Shop tracker →
      </Link>
      <Link href="/admin/analytics?tab=benchmarking" className="hover:text-cyan-300">
        Benchmarking history →
      </Link>
      <Link href="/spying/reports" className="hover:text-cyan-300">
        Recurring reports →
      </Link>
    </footer>
  );
}
