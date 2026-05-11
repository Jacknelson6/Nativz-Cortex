// SPY-09 T07: PATCH /api/prospects/[id]/present/plan
//
// Strategist edits to the LLM-drafted plan. Stores 3 items verbatim,
// marks strategist_edited=true so the editor UI surfaces the badge.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getLatestAnalysis } from '@/lib/prospects/analysis-queries';
import type { ThirtyDayPlan } from '@/lib/prospects/types';

export const dynamic = 'force-dynamic';

const ItemSchema = z.object({
  id: z.string().min(1).max(40),
  title: z.string().min(1).max(80),
  body: z.string().min(1).max(240),
  rationale: z.string().min(1).max(200),
});

const Body = z.object({
  items: z.array(ItemSchema).length(3),
});

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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const json = (await request.json().catch(() => ({}))) as unknown;
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message }, { status: 400 });
    }

    const analysis = await getLatestAnalysis(id);
    if (!analysis) {
      return NextResponse.json({ error: 'No analysis available.' }, { status: 422 });
    }

    const admin = createAdminClient();
    const plan: ThirtyDayPlan = {
      generated_at: analysis.thirty_day_plan?.generated_at ?? new Date().toISOString(),
      items: parsed.data.items,
      strategist_edited: true,
    };

    const { error: updateError } = await admin
      .from('prospect_analyses')
      .update({ thirty_day_plan: plan })
      .eq('id', analysis.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ plan });
  } catch (err) {
    console.error('PATCH /api/prospects/[id]/present/plan error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
