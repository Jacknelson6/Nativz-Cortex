import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getKnowledgeEntries, createKnowledgeEntry } from '@/lib/knowledge/queries';
import type { KnowledgeEntryType } from '@/lib/knowledge/types';

const createSchema = z.object({
  type: z.enum(['brand_asset', 'brand_profile', 'document', 'web_page', 'note', 'idea', 'meeting_note']),
  title: z.string().min(1),
  content: z.string().default(''),
  metadata: z.record(z.string(), z.unknown()).default({}),
  source: z.enum(['manual', 'scraped', 'generated', 'imported']).default('manual'),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: clientId } = await params;

    const typeParam = request.nextUrl.searchParams.get('type');
    const type = typeParam as KnowledgeEntryType | undefined;

    const entries = await getKnowledgeEntries(clientId, type || undefined);

    return NextResponse.json({ entries });
  } catch (error) {
    console.error('GET /api/clients/[id]/knowledge error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

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
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { id: clientId } = await params;

    const entry = await createKnowledgeEntry({
      client_id: clientId,
      type: parsed.data.type,
      title: parsed.data.title,
      content: parsed.data.content,
      metadata: parsed.data.metadata,
      source: parsed.data.source,
      created_by: user.id,
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    console.error('POST /api/clients/[id]/knowledge error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
