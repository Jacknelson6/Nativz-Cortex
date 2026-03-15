import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createKnowledgeLink, deleteKnowledgeLink } from '@/lib/knowledge/queries';

const linkSchema = z.object({
  source_id: z.string().uuid(),
  source_type: z.enum(['entry', 'contact', 'search', 'strategy', 'idea_submission']),
  target_id: z.string().uuid(),
  target_type: z.enum(['entry', 'contact', 'search', 'strategy', 'idea_submission']),
  label: z.string().default('related_to'),
});

/**
 * POST /api/clients/[id]/knowledge/links
 *
 * Create a directional knowledge link between two entities within a client's knowledge graph.
 * Links connect entries, contacts, searches, strategies, or idea submissions.
 *
 * @auth Required (admin)
 * @param id - Client UUID
 * @body source_id - UUID of the source entity (required)
 * @body source_type - Type of the source: 'entry' | 'contact' | 'search' | 'strategy' | 'idea_submission'
 * @body target_id - UUID of the target entity (required)
 * @body target_type - Type of the target: 'entry' | 'contact' | 'search' | 'strategy' | 'idea_submission'
 * @body label - Relationship label (default: 'related_to')
 * @returns {{ link: KnowledgeLink }} Created link record (201)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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
    const parsed = linkSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { id: clientId } = await params;

    const link = await createKnowledgeLink({
      client_id: clientId,
      source_id: parsed.data.source_id,
      source_type: parsed.data.source_type,
      target_id: parsed.data.target_id,
      target_type: parsed.data.target_type,
      label: parsed.data.label,
    });

    return NextResponse.json({ link }, { status: 201 });
  } catch (error) {
    console.error('POST /api/clients/[id]/knowledge/links error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/clients/[id]/knowledge/links
 *
 * Permanently delete a knowledge link by its ID.
 *
 * @auth Required (admin)
 * @param id - Client UUID
 * @query id - Knowledge link UUID to delete (required)
 * @returns {{ success: true }}
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const linkId = request.nextUrl.searchParams.get('id');
    if (!linkId) {
      return NextResponse.json({ error: 'Link ID is required' }, { status: 400 });
    }

    // Ensure params are consumed (Next.js 15 requirement)
    await params;

    await deleteKnowledgeLink(linkId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/clients/[id]/knowledge/links error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
