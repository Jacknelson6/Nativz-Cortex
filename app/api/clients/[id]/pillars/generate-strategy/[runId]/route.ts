import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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
