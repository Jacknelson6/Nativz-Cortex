import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';
import {
  FIELD_TRACK,
  validateTransition,
  stampStageChange,
  type PipelineItemSnapshot,
} from '@/lib/pipeline/transitions';
import { syncTeamAssignees } from '@/lib/pipeline/team-assignees';

const STATUS_FIELDS = [
  'assignment_status',
  'raws_status',
  'editing_status',
  'client_approval_status',
  'boosting_status',
] as const;

const UpdateSchema = z.object({
  assignment_status: z.enum(['can_assign', 'assigned', 'need_shoot']).optional(),
  raws_status: z.enum(['need_to_schedule', 'waiting_on_shoot', 'uploaded']).optional(),
  editing_status: z.enum(['not_started', 'editing', 'edited', 'em_approved', 'revising', 'blocked', 'scheduled', 'done']).optional(),
  client_approval_status: z.enum(['not_sent', 'waiting_on_approval', 'client_approved', 'needs_revision', 'revised', 'sent_to_paid_media']).optional(),
  boosting_status: z.enum(['not_boosting', 'working_on_it', 'done']).optional(),
  strategist: z.string().optional(),
  videographer: z.string().optional(),
  editing_manager: z.string().optional(),
  editor: z.string().optional(),
  smm: z.string().optional(),
  // Id columns (NAT-27 dual-write). Nullable so callers can clear an
  // assignment. Names stay in sync via the syncTeamAssignees helper below.
  strategist_id: z.string().uuid().nullable().optional(),
  videographer_id: z.string().uuid().nullable().optional(),
  editing_manager_id: z.string().uuid().nullable().optional(),
  editor_id: z.string().uuid().nullable().optional(),
  smm_id: z.string().uuid().nullable().optional(),
  shoot_date: z.string().nullable().optional(),
  strategy_due_date: z.string().nullable().optional(),
  raws_due_date: z.string().nullable().optional(),
  smm_due_date: z.string().nullable().optional(),
  calendar_sent_date: z.string().nullable().optional(),
  edited_videos_folder_url: z.string().nullable().optional(),
  raws_folder_url: z.string().nullable().optional(),
  later_calendar_link: z.string().nullable().optional(),
  project_brief_url: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  agency: z.string().nullable().optional(),
}).partial();

/**
 * PATCH /api/pipeline/[id]
 *
 * Update one or more status fields or metadata on a content pipeline item.
 * Allows setting any combination of the five status tracks plus team assignments,
 * dates, folder URLs, and notes.
 *
 * @auth Required (any authenticated user)
 * @param id - Content pipeline item UUID
 * @body assignment_status - 'can_assign' | 'assigned' | 'need_shoot'
 * @body raws_status - 'need_to_schedule' | 'waiting_on_shoot' | 'uploaded'
 * @body editing_status - 'not_started' | 'editing' | 'edited' | 'em_approved' | 'revising' | 'blocked' | 'scheduled' | 'done'
 * @body client_approval_status - 'not_sent' | 'waiting_on_approval' | 'client_approved' | 'needs_revision' | 'revised' | 'sent_to_paid_media'
 * @body boosting_status - 'not_boosting' | 'working_on_it' | 'done'
 * @body strategist - Strategist name
 * @body videographer - Videographer name
 * @body editing_manager - Editing manager name
 * @body editor - Editor name
 * @body smm - Social media manager name
 * @body shoot_date - Shoot date (YYYY-MM-DD)
 * @body strategy_due_date - Strategy due date
 * @body raws_due_date - Raws due date
 * @body smm_due_date - SMM due date
 * @body calendar_sent_date - Date calendar was sent
 * @body edited_videos_folder_url - URL to edited videos folder
 * @body raws_folder_url - URL to raws folder
 * @body later_calendar_link - Later.com calendar link
 * @body project_brief_url - Project brief URL
 * @body notes - General notes
 * @body agency - Agency override
 * @returns {ContentPipelineItem} Updated pipeline item
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Status fields have to pass the transition matrix — matches the advance
    // endpoint so drag-drop on the Kanban board can't silently corrupt state
    // by jumping past intermediate stages (e.g. dragging "not_started" straight
    // to "em_approved" without anyone editing the video).
    const statusChanges = STATUS_FIELDS.filter((f) => parsed.data[f] !== undefined);
    let stageChangedAtUpdate: Record<string, unknown> | undefined;
    if (statusChanges.length > 0) {
      const { data: current, error: currentErr } = await adminClient
        .from('content_pipeline')
        .select(
          'assignment_status, raws_status, editing_status, client_approval_status, boosting_status, stage_changed_at',
        )
        .eq('id', id)
        .single();
      if (currentErr || !current) {
        return NextResponse.json({ error: 'Pipeline item not found' }, { status: 404 });
      }
      const snapshot = current as unknown as PipelineItemSnapshot;
      const now = new Date();
      let nextStageChangedAt =
        (current.stage_changed_at as Record<string, unknown> | null) ?? {};
      for (const field of statusChanges) {
        const from = snapshot[field];
        const to = parsed.data[field] as string;
        const check = validateTransition(FIELD_TRACK[field], from, to, snapshot);
        if (!check.ok) {
          return NextResponse.json({ error: check.reason }, { status: 422 });
        }
        if (from !== to) {
          nextStageChangedAt = stampStageChange(nextStageChangedAt, field, now);
        }
      }
      stageChangedAtUpdate = nextStageChangedAt;
    }

    // Mirror name ↔ id on team assignees so the DB stays consistent whether
    // the caller sent the display name, the FK, or both.
    const syncedPatch = await syncTeamAssignees(parsed.data);

    const { data, error } = await adminClient
      .from('content_pipeline')
      .update({
        ...syncedPatch,
        ...(stageChangedAtUpdate ? { stage_changed_at: stageChangedAtUpdate } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Update pipeline error:', error);
      return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('PATCH /api/pipeline/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/pipeline/[id]
 *
 * Permanently delete a content pipeline item.
 *
 * @auth Required (any authenticated user)
 * @param id - Content pipeline item UUID
 * @returns {{ success: true }}
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from('content_pipeline')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/pipeline/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
