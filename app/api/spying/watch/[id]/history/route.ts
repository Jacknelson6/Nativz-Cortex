import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const ADMIN_ROLES = ['admin', 'super_admin'];

/** GET /api/spying/watch/[id]/history — full snapshot history for a single
 *  client_benchmarks row. Powers the watch-history drawer on /spying.
 *  Returns the rows in chronological order so the chart code can map them
 *  straight onto an x-axis without resorting. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminClient = createAdminClient();
  const { data: me } = await adminClient
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  if (!me || (!ADMIN_ROLES.includes(me.role) && !me.is_super_admin)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: benchmark, error: benchErr } = await adminClient
    .from('client_benchmarks')
    .select(
      'id, client_id, cadence, last_snapshot_at, is_active, client:clients(name, logo_url)',
    )
    .eq('id', id)
    .maybeSingle();

  if (benchErr) {
    return NextResponse.json({ error: benchErr.message }, { status: 500 });
  }
  if (!benchmark) {
    return NextResponse.json({ error: 'Watch not found' }, { status: 404 });
  }

  const { data: snaps, error: snapsErr } = await adminClient
    .from('benchmark_snapshots')
    .select(
      'id, captured_at, platform, username, display_name, profile_url, followers, posts_count, avg_views, engagement_rate, posting_frequency, followers_delta, posts_count_delta, engagement_rate_delta, new_posts, scrape_error',
    )
    .eq('benchmark_id', id)
    .order('captured_at', { ascending: true })
    .limit(180);

  if (snapsErr) {
    return NextResponse.json({ error: snapsErr.message }, { status: 500 });
  }

  return NextResponse.json({
    benchmark,
    snapshots: snaps ?? [],
  });
}
