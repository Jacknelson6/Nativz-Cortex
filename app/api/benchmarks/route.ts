import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 30;

/**
 * GET /api/benchmarks?clientId=<uuid>
 *
 * Phase 3 — powers the audit-derived benchmarking section on
 * /admin/analytics. Returns every active `client_benchmarks` row for the
 * client, each with the latest snapshot per (platform, username) and the
 * full snapshot history (sorted asc) so the chart can plot a timeline.
 *
 * Auth: admin full access; portal viewers must have `user_client_access`
 * for the requested client. RLS handles the viewer path when we use the
 * server client; we double-check server-side for clear error codes.
 */
export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get('clientId');
  if (!clientId) {
    return NextResponse.json({ error: 'clientId required' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  // Role gate — admins see everything, viewers only clients they can access.
  const { data: me } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  const isAdmin = me?.role === 'admin';
  if (!isAdmin) {
    const { data: access } = await admin
      .from('user_client_access')
      .select('client_id')
      .eq('user_id', user.id)
      .eq('client_id', clientId)
      .maybeSingle();
    if (!access) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  // Load active benchmarks for the client.
  const { data: benchmarks, error: bErr } = await admin
    .from('client_benchmarks')
    .select(
      'id, audit_id, cadence, analytics_source, date_range_start, date_range_end, last_snapshot_at, next_snapshot_due_at, competitors_snapshot, created_at',
    )
    .eq('client_id', clientId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (bErr) {
    console.error('[benchmarks] query failed:', bErr);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  if (!benchmarks || benchmarks.length === 0) {
    return NextResponse.json({ benchmarks: [] });
  }

  // Pull ALL snapshots for these benchmarks in one round-trip; bucket in
  // JS. Avoids N round trips when a client has several attached audits.
  const benchmarkIds = benchmarks.map((b) => b.id);
  const { data: snapshotRows } = await admin
    .from('benchmark_snapshots')
    .select(
      'id, benchmark_id, platform, username, display_name, followers, posts_count, avg_views, engagement_rate, posting_frequency, followers_delta, posts_count_delta, avg_views_delta, new_posts, scrape_error, captured_at',
    )
    .in('benchmark_id', benchmarkIds)
    .order('captured_at', { ascending: true });

  const byBenchmark = new Map<string, typeof snapshotRows>();
  for (const s of snapshotRows ?? []) {
    const list = byBenchmark.get(s.benchmark_id) ?? [];
    list.push(s);
    byBenchmark.set(s.benchmark_id, list);
  }

  const payload = benchmarks.map((b) => ({
    id: b.id,
    auditId: b.audit_id,
    cadence: b.cadence,
    analyticsSource: b.analytics_source,
    dateRangeStart: b.date_range_start,
    dateRangeEnd: b.date_range_end,
    lastSnapshotAt: b.last_snapshot_at,
    nextSnapshotDueAt: b.next_snapshot_due_at,
    createdAt: b.created_at,
    competitors: b.competitors_snapshot ?? [],
    snapshots: byBenchmark.get(b.id) ?? [],
  }));

  return NextResponse.json({ benchmarks: payload });
}
