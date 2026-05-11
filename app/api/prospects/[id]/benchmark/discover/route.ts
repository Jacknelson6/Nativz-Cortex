// SPY-05 T12: synchronous LLM-driven competitor discovery for a prospect.
// Returns up to 5 candidates. Strategist confirms 1-3 in the wizard and
// then POSTs them to /api/prospects/[id]/benchmark to actually run.

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { discoverCompetitorsForProspect } from '@/lib/prospects/discover-competitors-for-prospect';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const admin = createAdminClient();
    const { data: prospect } = await admin
      .from('prospects')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (!prospect) return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });

    const { candidates, cost_cents } = await discoverCompetitorsForProspect(id);

    return NextResponse.json({ candidates, cost_cents });
  } catch (err) {
    console.error('POST /api/prospects/[id]/benchmark/discover error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
