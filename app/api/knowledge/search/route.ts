import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const searchSchema = z.object({
  query: z.string().min(1),
  kinds: z.array(z.string()).optional(),
  domains: z.array(z.string()).optional(),
  client_id: z.string().uuid().nullable().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

/**
 * POST /api/knowledge/search
 *
 * Semantic search over knowledge nodes using Gemini embeddings.
 * Falls back to FTS if embedding generation fails.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = searchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const { query, kinds, domains, client_id, limit } = parsed.data;

    // Try semantic search first — generate embedding via Gemini
    try {
      const apiKey = process.env.GOOGLE_AI_API_KEY;
      if (apiKey) {
        const embRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'models/text-embedding-004',
              content: { parts: [{ text: query }] },
            }),
          }
        );

        if (embRes.ok) {
          const embData = await embRes.json();
          const embedding = embData?.embedding?.values;

          if (embedding && Array.isArray(embedding)) {
            const { data, error } = await admin.rpc('search_knowledge_nodes', {
              query_embedding: embedding,
              target_client_id: client_id ?? null,
              target_kinds: kinds ?? null,
              target_domains: domains ?? null,
              match_limit: limit,
              similarity_threshold: 0.3,
            });

            if (!error && data && data.length > 0) {
              return NextResponse.json({ nodes: data, method: 'semantic' });
            }
          }
        }
      }
    } catch (embError) {
      console.warn('Semantic search failed, falling back to FTS:', embError);
    }

    // Fallback to full-text search
    const { data, error } = await admin.rpc('search_knowledge_nodes_fts', {
      query_text: query,
      target_client_id: client_id ?? null,
      target_kinds: kinds ?? null,
      match_limit: limit,
    });

    if (error) {
      console.error('FTS search error:', error);
      return NextResponse.json({ error: 'Search failed' }, { status: 500 });
    }

    return NextResponse.json({ nodes: data ?? [], method: 'fts' });
  } catch (error) {
    console.error('POST /api/knowledge/search error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
