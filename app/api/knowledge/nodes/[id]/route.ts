import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { writeNodeToGitHub } from '@/lib/knowledge/github-sync';
import { assertUserCanAccessClient, getUserRoleInfo } from '@/lib/api/client-access';

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  kind: z.string().min(1).optional(),
  domain: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  connections: z.array(z.string()).optional(),
  content: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  client_id: z.string().uuid().nullable().optional(),
});

/**
 * GET /api/knowledge/nodes/[id]
 *
 * Get a single knowledge node with full content.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const admin = createAdminClient();

    const { data, error } = await admin
      .from('knowledge_nodes')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 });
    }

    // Org scoping: if the node belongs to a client, verify viewer access
    if (data.client_id) {
      const access = await assertUserCanAccessClient(admin, user.id, data.client_id as string);
      if (!access.allowed) {
        return NextResponse.json({ error: 'Node not found' }, { status: 404 });
      }
    } else {
      // Node has no client_id (agency-level) — only admins can view
      const roleInfo = await getUserRoleInfo(admin, user.id);
      if (!roleInfo.isAdmin) {
        return NextResponse.json({ error: 'Node not found' }, { status: 404 });
      }
    }

    return NextResponse.json({ node: data });
  } catch (error) {
    console.error('GET /api/knowledge/nodes/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT /api/knowledge/nodes/[id]
 *
 * Update a knowledge node.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: userData } = await admin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = {
      ...parsed.data,
      updated_at: new Date().toISOString(),
      sync_status: 'pending',
    };

    const { data, error } = await admin
      .from('knowledge_nodes')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      console.error('Update knowledge node error:', error);
      return NextResponse.json({ error: 'Failed to update node' }, { status: 500 });
    }

    // Fire-and-forget GitHub write-back
    writeNodeToGitHub(data).catch((err) =>
      console.error('GitHub write-back failed:', err),
    );

    return NextResponse.json({ node: data });
  } catch (error) {
    console.error('PUT /api/knowledge/nodes/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/knowledge/nodes/[id]
 *
 * Delete a knowledge node.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: userData } = await admin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { id } = await params;

    const { error } = await admin
      .from('knowledge_nodes')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Delete knowledge node error:', error);
      return NextResponse.json({ error: 'Failed to delete node' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/knowledge/nodes/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
