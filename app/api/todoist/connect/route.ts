import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateTodoistKey, getTodoistProjects } from '@/lib/todoist/client';

const connectSchema = z.object({
  api_key: z.string().min(1),
  project_id: z.string().optional(),
});

/**
 * POST /api/todoist/connect
 *
 * Connect Todoist by saving and validating an API key. Pass api_key='_keep' to update
 * only the project_id without changing the key. Returns available Todoist projects on success.
 *
 * @auth Required (any authenticated user)
 * @body api_key - Todoist API key to validate and save, or '_keep' to only update project
 * @body project_id - Optional Todoist project ID to sync tasks into
 * @returns {{ connected: true, projects: { id: string, name: string }[] }}
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = connectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'API key is required' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Special case: "_keep" means just update the project, not the key
    if (parsed.data.api_key === '_keep') {
      const { error } = await admin
        .from('users')
        .update({ todoist_project_id: parsed.data.project_id ?? null })
        .eq('id', user.id);

      if (error) {
        return NextResponse.json({ error: 'Failed to save project' }, { status: 500 });
      }
      return NextResponse.json({ updated: true });
    }

    // Validate the key by fetching projects
    const valid = await validateTodoistKey(parsed.data.api_key);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid Todoist API key' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {
      todoist_api_key: parsed.data.api_key,
    };
    if (parsed.data.project_id) {
      updateData.todoist_project_id = parsed.data.project_id;
    }

    const { error } = await admin
      .from('users')
      .update(updateData)
      .eq('id', user.id);

    if (error) {
      console.error('POST /api/todoist/connect error:', error);
      return NextResponse.json({ error: 'Failed to save API key' }, { status: 500 });
    }

    // Return projects so user can optionally pick one
    const projects = await getTodoistProjects(parsed.data.api_key);

    return NextResponse.json({ connected: true, projects });
  } catch (error) {
    console.error('POST /api/todoist/connect error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/todoist/connect
 *
 * Disconnect Todoist by clearing the API key, project ID, and sync timestamp.
 *
 * @auth Required (any authenticated user)
 * @returns {{ disconnected: true }}
 */
export async function DELETE() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    await admin
      .from('users')
      .update({
        todoist_api_key: null,
        todoist_project_id: null,
        todoist_synced_at: null,
      })
      .eq('id', user.id);

    return NextResponse.json({ disconnected: true });
  } catch (error) {
    console.error('DELETE /api/todoist/connect error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/todoist/connect
 *
 * Check the Todoist connection status for the authenticated user. Fetches available projects
 * from the Todoist API to validate the stored key. Returns key_invalid=true if the stored
 * key is no longer valid.
 *
 * @auth Required (any authenticated user)
 * @returns {{ connected: boolean, key_invalid?: boolean, project_id: string | null, synced_at: string | null, projects: { id: string, name: string }[] }}
 */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data } = await admin
      .from('users')
      .select('todoist_api_key, todoist_project_id, todoist_synced_at')
      .eq('id', user.id)
      .single();

    if (!data?.todoist_api_key) {
      return NextResponse.json({ connected: false });
    }

    // Fetch projects for the dropdown — also validates the key
    let projects: { id: string; name: string }[] = [];
    let keyValid = true;
    try {
      projects = await getTodoistProjects(data.todoist_api_key);
    } catch {
      keyValid = false;
    }

    return NextResponse.json({
      connected: keyValid,
      key_invalid: !keyValid,
      project_id: data.todoist_project_id,
      synced_at: data.todoist_synced_at,
      projects,
    });
  } catch (error) {
    console.error('GET /api/todoist/connect error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
