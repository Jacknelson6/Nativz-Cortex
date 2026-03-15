import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validateApiKey } from '@/lib/api-keys/validate';
import { getKnowledgeEntries, getKnowledgeLinks, createKnowledgeEntry } from '@/lib/knowledge/queries';
import { createAdminClient } from '@/lib/supabase/admin';
import type { KnowledgeEntryType } from '@/lib/knowledge/types';

const createSchema = z.object({
  type: z.enum(['brand_asset', 'brand_profile', 'document', 'web_page', 'note', 'idea', 'meeting_note']),
  title: z.string().min(1),
  content: z.string().default(''),
  metadata: z.record(z.string(), z.unknown()).default({}),
  source: z.enum(['manual', 'scraped', 'generated', 'imported']).default('manual'),
});

/**
 * GET /api/v1/clients/[id]/knowledge
 *
 * List knowledge entries for a client. Supports full-text search via the
 * search_knowledge_entries RPC, filtering by type, and optionally including
 * entity metadata and knowledge graph links.
 *
 * @auth API key (Bearer token via Authorization header)
 * @param id - Client UUID
 * @query type - Filter by entry type: 'brand_asset' | 'brand_profile' | 'document' | 'web_page' | 'note' | 'idea' | 'meeting_note' (optional)
 * @query search - Full-text search query (optional)
 * @query include_links - Include knowledge graph links (optional, default false)
 * @query include_entities - Include entity metadata on results (optional, default false)
 * @returns {{ entries: KnowledgeEntry[], links?: KnowledgeLink[] }}
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await validateApiKey(request);
  if ('error' in auth) return auth.error;

  try {
    const { id: clientId } = await params;
    const url = request.nextUrl;

    const typeParam = url.searchParams.get('type');
    const type = typeParam as KnowledgeEntryType | undefined;
    const searchQuery = url.searchParams.get('search');
    const includeLinks = url.searchParams.get('include_links') === 'true';
    const includeEntities = url.searchParams.get('include_entities') === 'true';

    let entries;

    // Full-text search if query provided
    if (searchQuery) {
      const admin = createAdminClient();
      const { data, error } = await admin.rpc('search_knowledge_entries', {
        p_client_id: clientId,
        p_query: searchQuery,
        p_type: type ?? null,
        p_limit: 20,
      });
      if (error) throw new Error(error.message);
      entries = data ?? [];
    } else {
      entries = await getKnowledgeEntries(clientId, type || undefined);
    }

    // Optionally strip entities from metadata
    const result = entries.map((e: { id: string; type: string; title: string; content: string; metadata: unknown; source: string; created_at: string }) => {
      const base = {
        id: e.id,
        type: e.type,
        title: e.title,
        content: e.content,
        source: e.source,
        created_at: e.created_at,
      };

      if (includeEntities && e.metadata) {
        return { ...base, metadata: e.metadata };
      }

      return base;
    });

    const response: Record<string, unknown> = { entries: result };

    if (includeLinks) {
      const links = await getKnowledgeLinks(clientId);
      response.links = links;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('GET /api/v1/clients/[id]/knowledge error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/v1/clients/[id]/knowledge
 *
 * Create a new knowledge entry for a client. Triggers automatic embedding
 * generation for semantic search.
 *
 * @auth API key (Bearer token via Authorization header)
 * @param id - Client UUID
 * @body type - Entry type: 'brand_asset' | 'brand_profile' | 'document' | 'web_page' | 'note' | 'idea' | 'meeting_note' (required)
 * @body title - Entry title (required)
 * @body content - Entry content text (optional, default '')
 * @body metadata - Arbitrary metadata object (optional)
 * @body source - Source type: 'manual' | 'scraped' | 'generated' | 'imported' (default 'manual')
 * @returns {{ entry: KnowledgeEntry }}
 */
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
