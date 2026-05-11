// SPY-05 T14: cancel an in-flight benchmark. Sets cancelled_at + status;
// the orchestrator polls between stages and bails out.

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ProspectBenchmarkStatus } from '@/lib/prospects/types';

export const dynamic = 'force-dynamic';

async function requireAdmin(): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const admin = createAdminClient();
  const { data } = await admin.from('users').select('role').eq('id', user.id).single();
  if (!data || !['admin', 'super_admin'].includes(data.role)) {
    return { ok: false, response: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) };
  }
  return { ok: true };
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; benchmark_id: string }> },
) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { id, benchmark_id } = await params;
    const admin = createAdminClient();

    const { data: row } = await admin
      .from('prospect_competitor_benchmarks')
      .select('id, prospect_id, status')
      .eq('id', benchmark_id)
      .maybeSingle();

    if (!row || row.prospect_id !== id) {
      return NextResponse.json({ error: 'Benchmark not found' }, { status: 404 });
    }

    if (
      ['succeeded', 'partial', 'failed', 'cancelled'].includes(row.status as ProspectBenchmarkStatus)
    ) {
      return NextResponse.json({ ok: true, status: row.status });
    }

    await admin
      .from('prospect_competitor_benchmarks')
      .update({
        cancelled_at: new Date().toISOString(),
        status: 'cancelled' satisfies ProspectBenchmarkStatus,
      })
      .eq('id', benchmark_id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('POST /api/prospects/[id]/benchmark/[benchmark_id]/cancel error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
