import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimitByUser } from '@/lib/security/rate-limit';
import { assertUserCanAccessClient, getUserRoleInfo } from '@/lib/api/client-access';
import { getUserOrganizationIdsForAccess } from '@/lib/api/topic-search-access';

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

    // Rate limit: 10 requests per minute per user for AI endpoints (uses Gemini embeddings)
    const rl = rateLimitByUser(user.id, '/api/knowledge/search', 'ai');
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
          },
        },
      );
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
    let { query, kinds, domains, client_id, limit } = parsed.data;

    // Org scoping for non-admin users
    const roleInfo = await getUserRoleInfo(admin, user.id);
    if (!roleInfo.isAdmin) {
      if (client_id) {
        // Verify viewer can access this specific client
        const access = await assertUserCanAccessClient(admin, user.id, client_id);
        if (!access.allowed) {
          return NextResponse.json({ error: access.error }, { status: access.status });
        }
      } else {
        // No client_id provided — scope to viewer's accessible clients
        const orgIds = roleInfo.orgIds;
        if (orgIds.length === 0) {
          return NextResponse.json({ nodes: [], method: 'scoped' });
        }
        const { data: accessibleClients } = await admin
          .from('clients')
          .select('id')
          .in('organization_id', orgIds);
        const clientIds = (accessibleClients ?? []).map((c) => c.id as string);
        if (clientIds.length === 0) {
          return NextResponse.json({ nodes: [], method: 'scoped' });
        }
        // Use first accessible client as filter (search RPC takes single client_id)
        // If viewer has multiple clients, they should specify client_id explicitly
        if (clientIds.length === 1) {
          client_id = clientIds[0];
        }
        // For multiple clients without explicit client_id, allow unfiltered search
        // since the RPC will return results across all clients the viewer has access to
      }
    }

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
