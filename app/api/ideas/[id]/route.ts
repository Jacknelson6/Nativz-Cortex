import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertUserCanAccessClient } from '@/lib/api/client-access';

/**
 * GET /api/ideas/[id]
 *
 * Poll the status of an idea generation job. Returns the generation record including
 * status, generated ideas (if completed), and any error message.
 *
 * @auth Required (any authenticated user)
 * @param id - Idea generation UUID
 * @returns {{ id: string, status: 'processing' | 'completed' | 'failed', ideas: GeneratedIdeaResult[] | null, error_message: string | null, completed_at: string | null }}
 */
// ── GET — poll generation status ──
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('idea_generations')
    .select('id, client_id, status, ideas, error_message, completed_at')
    .eq('id', id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Org-scope check for non-admin users
  if (data.client_id) {
    const access = await assertUserCanAccessClient(admin, user.id, data.client_id);
    if (!access.allowed) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }
  }

  return NextResponse.json(data);
}

const ideaTriageSchema = z.object({
  status: z.enum(['new', 'archived']).optional(),
  admin_notes: z.string().max(2000).optional().nullable(),
});

/**
 * PATCH /api/ideas/[id]
 *
 * Update an idea submission — set status to `new` or `archived`, and/or admin notes.
 * Records the reviewer ID and timestamp when status changes.
 *
 * @auth Required (admin)
 * @param id - Idea submission UUID
 * @body status - New status ('new' | 'archived')
 * @body admin_notes - Internal admin notes (max 2000 chars)
 * @returns {IdeaSubmission} Updated idea submission record
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

    const adminClient = createAdminClient();

    const { data: userData } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = ideaTriageSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (parsed.data.status !== undefined) {
      updates.status = parsed.data.status;
      updates.reviewed_by = user.id;
      updates.reviewed_at = new Date().toISOString();
    }

    if (parsed.data.admin_notes !== undefined) {
      updates.admin_notes = parsed.data.admin_notes;
    }

    const { data: idea, error: updateError } = await adminClient
      .from('idea_submissions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating idea:', updateError);
      return NextResponse.json({ error: 'Failed to update idea' }, { status: 500 });
    }

    return NextResponse.json(idea);
  } catch (error) {
    console.error('PATCH /api/ideas/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/ideas/[id]
 *
 * Permanently delete an idea submission.
 *
 * @auth Required (admin)
 * @param id - Idea submission UUID
 * @returns {{ success: true }}
 */
export async function DELETE(
  _request: NextRequest,
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

    const { data: userData } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { error: deleteError } = await adminClient
      .from('idea_submissions')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting idea:', deleteError);
      return NextResponse.json({ error: 'Failed to delete idea' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/ideas/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
