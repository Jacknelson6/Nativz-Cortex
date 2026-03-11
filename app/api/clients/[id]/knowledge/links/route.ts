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
