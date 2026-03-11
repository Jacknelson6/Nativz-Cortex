import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

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
    const { data, error } = await adminClient
      .from('content_pipeline')
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
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
