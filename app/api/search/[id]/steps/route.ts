import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/search/[id]/steps
 * Returns the current pipeline_state.steps array for real-time stepper UI.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();

    const { data: search, error: fetchError } = await adminClient
      .from('topic_searches')
      .select('id, status, client_id, pipeline_state')
      .eq('id', id)
      .single();

    if (fetchError || !search) {
      return NextResponse.json({ error: 'Search not found' }, { status: 404 });
    }

    // Org scope check: portal users can only view their org's client searches
    if (search.client_id) {
      const { data: userData } = await adminClient
        .from('users')
        .select('role, organization_id')
        .eq('id', user.id)
        .single();
      if (userData?.role === 'viewer') {
        const { data: client } = await adminClient
          .from('clients')
          .select('organization_id')
          .eq('id', search.client_id)
          .single();
        if (client && client.organization_id !== userData.organization_id) {
          return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }
      }
    }

    const pipelineState = search.pipeline_state as Record<string, unknown> | null;
    const uiSteps = (pipelineState?.ui_steps ?? pipelineState) as {
      steps?: unknown[];
      currentStep?: string;
    } | null;

    return NextResponse.json({
      status: search.status,
      steps: uiSteps?.steps ?? [],
      currentStep: uiSteps?.currentStep ?? null,
    });
  } catch (error) {
    console.error('GET /api/search/[id]/steps error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
