// SPY-09 T06: POST /api/prospects/[id]/present/draft-plan
//
// Generate a fresh 30-day plan via Sonnet 4.5 and persist it on
// prospect_analyses.thirty_day_plan for the latest analysis row. Resets
// strategist_edited to false so the editor knows this is an LLM draft.

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getLatestAnalysis } from '@/lib/prospects/analysis-queries';
import { computeScorecard } from '@/lib/prospects/checklist';
import { draft30DayPlan } from '@/lib/prospects/draft-30-day-plan';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

async function requireAdmin(): Promise<
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const admin = createAdminClient();
  const { data: row } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!row || !['admin', 'super_admin'].includes(row.role)) {
    return { ok: false, response: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) };
  }
  return { ok: true, userId: user.id };
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
      .select('id, brand_name')
      .eq('id', id)
      .maybeSingle();
    if (!prospect) {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
    }

    const analysis = await getLatestAnalysis(id);
    if (!analysis) {
      return NextResponse.json(
        { error: 'No analysis available — run analysis first.' },
        { status: 422 },
      );
    }

    const scorecard = computeScorecard(analysis);

    const plan = await draft30DayPlan({
      brandName: prospect.brand_name,
      scorecard,
      analysis,
    });

    const { error: updateError } = await admin
      .from('prospect_analyses')
      .update({ thirty_day_plan: plan })
      .eq('id', analysis.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ plan });
  } catch (err) {
    console.error('POST /api/prospects/[id]/present/draft-plan error', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
