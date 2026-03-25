import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const patchSchema = z.object({
  subtopics: z.array(z.string().min(1).max(200)).min(1).max(5),
  /** When true, move to processing so /process can run */
  start_processing: z.boolean().optional(),
});

/**
 * PATCH /api/search/[id]/subtopics
 * Save confirmed subtopics; optionally mark ready for POST /process.
 */
export async function PATCH(
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
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const { data: search, error: fetchErr } = await admin
      .from('topic_searches')
      .select('id, topic_pipeline, status, client_id')
      .eq('id', id)
      .single();

    if (fetchErr || !search) {
      return NextResponse.json({ error: 'Search not found' }, { status: 404 });
    }

    if ((search as { topic_pipeline?: string }).topic_pipeline !== 'llm_v1') {
      return NextResponse.json({ error: 'Not an llm_v1 search' }, { status: 400 });
    }

    if (search.client_id) {
      const { data: userData } = await admin
        .from('users')
        .select('role, organization_id')
        .eq('id', user.id)
        .single();
      if (userData?.role === 'viewer') {
        const { data: client } = await admin
          .from('clients')
          .select('organization_id')
          .eq('id', search.client_id)
          .single();
        if (client && client.organization_id !== userData.organization_id) {
          return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }
      }
    }

    const nextStatus = parsed.data.start_processing ? 'processing' : 'pending_subtopics';

    const { error: upErr } = await admin
      .from('topic_searches')
      .update({
        subtopics: parsed.data.subtopics,
        status: nextStatus,
      })
      .eq('id', id);

    if (upErr) {
      console.error('PATCH subtopics:', upErr);
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, status: nextStatus });
  } catch (e) {
    console.error('PATCH /subtopics:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
