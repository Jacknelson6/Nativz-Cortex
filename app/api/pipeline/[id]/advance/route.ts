import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  TRACK_FIELD,
  TRANSITIONS,
  validateTransition,
  type PipelineItemSnapshot,
  type PipelineTrack,
} from '@/lib/pipeline/transitions';

/**
 * POST /api/pipeline/[id]/advance
 *
 * Smart status advancement for pipeline items. Accepts a track name and
 * advances it to the logical next status, optionally with an explicit
 * target. Transitions are validated against the shared matrix in
 * lib/pipeline/transitions, so drag-drop on the board and quick-action
 * buttons follow the same rules.
 */

const advanceSchema = z.object({
  track: z.enum(['assignment', 'raws', 'editing', 'client_approval', 'boosting']),
  target_status: z.string().optional(),
});

export async function POST(
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
    const parsed = advanceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { track, target_status } = parsed.data;
    const admin = createAdminClient();

    const { data: item, error: fetchError } = await admin
      .from('content_pipeline')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !item) {
      return NextResponse.json({ error: 'Pipeline item not found' }, { status: 404 });
    }

    const field = TRACK_FIELD[track as PipelineTrack];
    const currentStatus = item[field] as string;
    const allowed = TRANSITIONS[track as PipelineTrack]?.[currentStatus] ?? [];

    let nextStatus: string;
    if (target_status) {
      nextStatus = target_status;
    } else {
      if (allowed.length === 0) {
        return NextResponse.json({
          error: `No further transitions available for ${track} from "${currentStatus}"`,
        }, { status: 422 });
      }
      nextStatus = allowed[0];
    }

    const check = validateTransition(
      track as PipelineTrack,
      currentStatus,
      nextStatus,
      item as unknown as PipelineItemSnapshot,
    );
    if (!check.ok) {
      return NextResponse.json({ error: check.reason }, { status: 422 });
    }

    const { data: updated, error: updateError } = await admin
      .from('content_pipeline')
      .update({ [field]: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update pipeline' }, { status: 500 });
    }

    return NextResponse.json({
      item: updated,
      transition: {
        track,
        from: currentStatus,
        to: nextStatus,
      },
    });
  } catch (error) {
    console.error('POST /api/pipeline/[id]/advance error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
