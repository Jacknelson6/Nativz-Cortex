import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/pipeline/[id]/advance
 *
 * Smart status advancement for pipeline items. Instead of setting raw status
 * values, this endpoint accepts a track name and advances it to the logical
 * next status. Optionally accepts an explicit target status for non-linear
 * transitions (e.g., "block" or "request revision").
 *
 * Tracks: assignment, raws, editing, client_approval, boosting
 *
 * Use when: An editor marks work as done, an EM approves, a client approves,
 * or any status needs to advance. Safer than raw PATCH because it validates
 * the transition is allowed.
 */

const advanceSchema = z.object({
  track: z.enum(['assignment', 'raws', 'editing', 'client_approval', 'boosting']),
  target_status: z.string().optional(),
});

// Defines valid transitions: current_status → [allowed next statuses]
const TRANSITIONS: Record<string, Record<string, string[]>> = {
  assignment: {
    can_assign: ['assigned'],
    assigned: ['need_shoot'],
    need_shoot: ['can_assign', 'assigned'],
  },
  raws: {
    need_to_schedule: ['waiting_on_shoot'],
    waiting_on_shoot: ['uploaded'],
    uploaded: ['waiting_on_shoot'],
  },
  editing: {
    not_started: ['editing'],
    editing: ['edited', 'blocked'],
    edited: ['em_approved', 'revising'],
    em_approved: ['scheduled', 'revising'],
    revising: ['edited', 'blocked'],
    blocked: ['editing', 'not_started'],
    scheduled: ['done'],
    done: ['revising'],
  },
  client_approval: {
    not_sent: ['waiting_on_approval'],
    waiting_on_approval: ['client_approved', 'needs_revision'],
    client_approved: ['sent_to_paid_media', 'needs_revision'],
    needs_revision: ['revised'],
    revised: ['waiting_on_approval'],
    sent_to_paid_media: [],
  },
  boosting: {
    not_boosting: ['working_on_it'],
    working_on_it: ['done'],
    done: ['working_on_it'],
  },
};

const TRACK_FIELD: Record<string, string> = {
  assignment: 'assignment_status',
  raws: 'raws_status',
  editing: 'editing_status',
  client_approval: 'client_approval_status',
  boosting: 'boosting_status',
};

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

    // Get current pipeline item
    const { data: item, error: fetchError } = await admin
      .from('content_pipeline')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !item) {
      return NextResponse.json({ error: 'Pipeline item not found' }, { status: 404 });
    }

    const field = TRACK_FIELD[track];
    const currentStatus = item[field] as string;
    const transitions = TRANSITIONS[track];
    const allowed = transitions[currentStatus] ?? [];

    let nextStatus: string;

    if (target_status) {
      // Explicit target — validate it's allowed
      if (!allowed.includes(target_status)) {
        return NextResponse.json({
          error: `Cannot transition ${track} from "${currentStatus}" to "${target_status}". Allowed: ${allowed.join(', ') || 'none'}`,
        }, { status: 422 });
      }
      nextStatus = target_status;
    } else {
      // Auto-advance — use first allowed transition
      if (allowed.length === 0) {
        return NextResponse.json({
          error: `No further transitions available for ${track} from "${currentStatus}"`,
        }, { status: 422 });
      }
      nextStatus = allowed[0];
    }

    // Apply the update
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
