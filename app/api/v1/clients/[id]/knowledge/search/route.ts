import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validateApiKey } from '@/lib/api-keys/validate';
import { createAdminClient } from '@/lib/supabase/admin';

const searchSchema = z.object({
  query: z.string().min(1),
  type: z.enum(['brand_asset', 'brand_profile', 'document', 'web_page', 'note', 'idea', 'meeting_note']).optional(),
  limit: z.number().min(1).max(50).default(20),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await validateApiKey(request);
  if ('error' in auth) return auth.error;

  try {
    const { id: clientId } = await params;
    const body = await request.json();
    const parsed = searchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const { data, error } = await admin.rpc('search_knowledge_entries', {
      p_client_id: clientId,
      p_query: parsed.data.query,
      p_type: parsed.data.type ?? null,
      p_limit: parsed.data.limit,
    });

    if (error) throw new Error(error.message);

    const results = (data ?? []).map((e: { id: string; type: string; title: string; content: string; source: string; created_at: string; metadata: unknown }) => ({
      id: e.id,
      type: e.type,
      title: e.title,
      content: e.content,
      source: e.source,
      created_at: e.created_at,
      metadata: e.metadata,
    }));

    return NextResponse.json({ results, total: results.length });
  } catch (error) {
    console.error('POST /api/v1/clients/[id]/knowledge/search error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
