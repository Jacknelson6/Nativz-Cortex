import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { writeNodeToGitHub } from '@/lib/knowledge/github-sync';

const createSchema = z.object({
  id: z.string().optional(),
  kind: z.string().min(1),
  title: z.string().min(1),
  domain: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  connections: z.array(z.string()).default([]),
  content: z.string().default(''),
  metadata: z.record(z.string(), z.unknown()).default({}),
  client_id: z.string().uuid().nullable().default(null),
});

/**
 * GET /api/knowledge/nodes
 *
 * List knowledge nodes with optional filters.
 *
 * @query kind - Filter by kind(s), comma-separated
 * @query domain - Filter by domain(s), comma-separated
 * @query client_id - Filter by client (use "agency" for client_id IS NULL)
 * @query q - Full-text search query
 * @query limit - Max results (default 100)
 * @query offset - Pagination offset (default 0)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const kindParam = searchParams.get('kind');
    const domainParam = searchParams.get('domain');
    const clientIdParam = searchParams.get('client_id');
    const qParam = searchParams.get('q');
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '100', 10), 500);
    const offset = parseInt(searchParams.get('offset') ?? '0', 10);

    const admin = createAdminClient();

    // If full-text search query is provided, use the RPC
    if (qParam && qParam.trim().length > 0) {
      const { data, error } = await admin.rpc('search_knowledge_nodes_fts', {
        query_text: qParam.trim(),
        target_client_id: clientIdParam === 'agency' ? null : clientIdParam ?? null,
        target_kinds: kindParam ? kindParam.split(',') : null,
        match_limit: limit,
      });

      if (error) {
        console.error('FTS search error:', error);
        return NextResponse.json({ error: 'Search failed' }, { status: 500 });
      }

      return NextResponse.json({ nodes: data ?? [] });
    }

    // Standard filtered query
    let query = admin
      .from('knowledge_nodes')
      .select('id, kind, title, domain, tags, connections, client_id, metadata, sync_status, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (kindParam) {
      const kinds = kindParam.split(',');
      query = query.in('kind', kinds);
    }

    if (domainParam) {
      const domains = domainParam.split(',');
      query = query.overlaps('domain', domains);
    }

    if (clientIdParam === 'agency') {
      query = query.is('client_id', null);
    } else if (clientIdParam) {
      query = query.or(`client_id.eq.${clientIdParam},client_id.is.null`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Knowledge nodes query error:', error);
      return NextResponse.json({ error: 'Failed to fetch nodes' }, { status: 500 });
    }

    return NextResponse.json({ nodes: data ?? [] });
  } catch (error) {
    console.error('GET /api/knowledge/nodes error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/knowledge/nodes
 *
 * Create a new knowledge node.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: userData } = await admin
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

    const slug = parsed.data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const nodeId = parsed.data.id || `${parsed.data.kind}:${slug}`;

    const { data, error } = await admin
      .from('knowledge_nodes')
      .insert({
        id: nodeId,
        kind: parsed.data.kind,
        title: parsed.data.title,
        domain: parsed.data.domain,
        tags: parsed.data.tags,
        connections: parsed.data.connections,
        content: parsed.data.content,
        metadata: parsed.data.metadata,
        client_id: parsed.data.client_id,
        created_by: user.email ?? user.id,
        sync_status: 'pending',
      })
      .select()
      .single();

    if (error) {
      console.error('Create knowledge node error:', error);
      return NextResponse.json({ error: 'Failed to create node' }, { status: 500 });
    }

    // Fire-and-forget GitHub write-back
    writeNodeToGitHub(data).catch((err) =>
      console.error('GitHub write-back failed:', err),
    );

    return NextResponse.json({ node: data }, { status: 201 });
  } catch (error) {
    console.error('POST /api/knowledge/nodes error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
