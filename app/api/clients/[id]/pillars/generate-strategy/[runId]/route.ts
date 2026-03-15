import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/clients/[id]/pillars/generate-strategy/[runId]
 *
 * Poll the status of a strategy pipeline run. Returns the full run record including
 * current_phase (pillars → ideas → scripts → done) and status.
 *
 * @auth Required (any authenticated user)
 * @param id - Client UUID
 * @param runId - Pipeline run UUID
 * @returns {{ run: StrategyPipelineRun }}
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; runId: string }> },
) {
  const { runId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: run, error } = await admin
    .from('strategy_pipeline_runs')
    .select('*')
    .eq('id', runId)
    .single();

  if (error || !run) {
    return NextResponse.json({ error: 'Pipeline run not found' }, { status: 404 });
  }

  return NextResponse.json({ run });
}
