import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertUserCanAccessTopicSearch } from '@/lib/api/topic-search-access';

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

    const access = await assertUserCanAccessTopicSearch(adminClient, user.id, id);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status === 404 ? 404 : 403 },
      );
    }

    const search = access.search as {
      id: string;
      status: string;
      client_id: string | null;
      pipeline_state: unknown;
    };

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
