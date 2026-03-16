import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getPortalClient } from '@/lib/portal/get-portal-client';
import { createKnowledgeEntry } from '@/lib/knowledge/queries';

const createSchema = z.object({
  type: z.enum(['brand_asset', 'document', 'web_page', 'note', 'idea']),
  title: z.string().min(1),
  content: z.string().default(''),
});

/**
 * POST /api/portal/knowledge
 *
 * Create a knowledge entry for the authenticated portal user's client.
 *
 * @auth Required (portal user session)
 * @body type - Entry type
 * @body title - Entry title
 * @body content - Entry content
 * @returns {{ entry: KnowledgeEntry }}
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await getPortalClient();
    if (!result) {
      return NextResponse.json({ error: 'No client found' }, { status: 404 });
    }

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      );
    }

    const entry = await createKnowledgeEntry({
      client_id: result.client.id,
      type: parsed.data.type,
      title: parsed.data.title,
      content: parsed.data.content,
      metadata: {},
      source: 'manual',
      created_by: user.id,
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    console.error('POST /api/portal/knowledge error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
