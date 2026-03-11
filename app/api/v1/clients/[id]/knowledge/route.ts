import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validateApiKey } from '@/lib/api-keys/validate';
import { getKnowledgeEntries, createKnowledgeEntry } from '@/lib/knowledge/queries';
import type { KnowledgeEntryType } from '@/lib/knowledge/types';

const createSchema = z.object({
  type: z.enum(['brand_asset', 'brand_profile', 'document', 'web_page', 'note', 'idea']),
  title: z.string().min(1),
  content: z.string().default(''),
  metadata: z.record(z.string(), z.unknown()).default({}),
  source: z.enum(['manual', 'scraped', 'generated', 'imported']).default('manual'),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await validateApiKey(request);
  if ('error' in auth) return auth.error;

  try {
    const { id: clientId } = await params;

    const typeParam = request.nextUrl.searchParams.get('type');
    const type = typeParam as KnowledgeEntryType | undefined;

    const entries = await getKnowledgeEntries(clientId, type || undefined);

    return NextResponse.json({ entries });
  } catch (error) {
    console.error('GET /api/v1/clients/[id]/knowledge error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await validateApiKey(request);
  if ('error' in auth) return auth.error;

  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
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
      created_by: null,
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    console.error('POST /api/v1/clients/[id]/knowledge error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
