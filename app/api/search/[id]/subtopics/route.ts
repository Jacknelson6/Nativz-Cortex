import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertUserCanAccessTopicSearch } from '@/lib/api/topic-search-access';

const patchSchema = z.object({
  subtopics: z.array(z.string().min(1).max(200)).min(1).max(15),
  /** When true, move to processing so /process can run */
  start_processing: z.boolean().optional(),
  /** Minimum view count filter for video scraping */
  minViews: z.number().int().min(0).optional(),
  /** Time range filter: today, week, month, year */
  timeRange: z.enum(['today', 'week', 'month', 'year']).optional(),
});

/**
 * PATCH /api/search/[id]/subtopics
 * Save confirmed subtopics; optionally mark ready for POST /process.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const access = await assertUserCanAccessTopicSearch(admin, user.id, id);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status === 404 ? 404 : 403 },
      );
    }

    const search = access.search as { id: string; topic_pipeline?: string; status: string };

    if (search.topic_pipeline !== 'llm_v1') {
      return NextResponse.json({ error: 'Not an llm_v1 search' }, { status: 400 });
    }

    const nextStatus = parsed.data.start_processing ? 'processing' : 'pending_subtopics';

    /** Merge filter preferences into pipeline_state JSONB */
    const pipelineStatePatch: Record<string, unknown> = {};
    if (parsed.data.minViews !== undefined) pipelineStatePatch.min_views = parsed.data.minViews;
    if (parsed.data.timeRange !== undefined) pipelineStatePatch.time_range = parsed.data.timeRange;

    /** Clear lease so POST /process can claim; avoids stuck 202 when retrying. */
    const { error: upErr } = await admin
      .from('topic_searches')
      .update({
        subtopics: parsed.data.subtopics,
        status: nextStatus,
        ...(parsed.data.start_processing ? { processing_started_at: null } : {}),
        ...(Object.keys(pipelineStatePatch).length > 0
          ? { pipeline_state: pipelineStatePatch }
          : {}),
      })
      .eq('id', id);

    if (upErr) {
      console.error('PATCH subtopics:', upErr);
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, status: nextStatus });
  } catch (e) {
    console.error('PATCH /subtopics:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
