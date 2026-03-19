import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { updateKnowledgeEntry, deleteKnowledgeEntry } from '@/lib/knowledge/queries';

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  client_visible: z.boolean().optional(),
});

/**
 * GET /api/clients/[id]/knowledge/[entryId]
 *
 * Fetch a single knowledge entry by ID, scoped to the specified client.
 *
 * @auth Required (any authenticated user)
 * @param id - Client UUID
 * @param entryId - Knowledge entry UUID
 * @returns {{ entry: KnowledgeEntry }}
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: clientId, entryId } = await params;

    const adminClient = createAdminClient();
    const { data: entry, error } = await adminClient
      .from('client_knowledge_entries')
      .select('*')
      .eq('id', entryId)
      .eq('client_id', clientId)
      .single();

    if (error || !entry) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    return NextResponse.json({ entry });
  } catch (error) {
    console.error('GET /api/clients/[id]/knowledge/[entryId] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/clients/[id]/knowledge/[entryId]
 *
 * Update a knowledge entry's title, content, or metadata. Also re-generates the
 * embedding on update (handled by updateKnowledgeEntry).
 *
 * @auth Required (admin)
 * @param id - Client UUID
 * @param entryId - Knowledge entry UUID
 * @body title - Optional new title
 * @body content - Optional new content
 * @body metadata - Optional metadata object
 * @returns {{ entry: KnowledgeEntry }}
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Admin-only
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
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { entryId } = await params;

    const entry = await updateKnowledgeEntry(entryId, parsed.data);

    return NextResponse.json({ entry });
  } catch (error) {
    console.error('PATCH /api/clients/[id]/knowledge/[entryId] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/clients/[id]/knowledge/[entryId]
 *
 * Permanently delete a knowledge entry and its embedding.
 *
 * @auth Required (admin)
 * @param id - Client UUID
 * @param entryId - Knowledge entry UUID to delete
 * @returns {{ success: true }}
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Admin-only
    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { entryId } = await params;

    await deleteKnowledgeEntry(entryId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/clients/[id]/knowledge/[entryId] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
