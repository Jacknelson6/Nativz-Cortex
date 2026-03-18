import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/knowledge/graph
 *
 * Get graph data (lightweight nodes + edges derived from connections arrays).
 * Returns only id, title, kind, domain, connections — no content.
 *
 * @query kind - Filter by kind(s), comma-separated
 * @query domain - Filter by domain(s), comma-separated
 * @query client_id - Filter by client (use "agency" for client_id IS NULL)
 * @query limit - Max nodes (default 500)
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
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '500', 10), 500);

    const admin = createAdminClient();

    let query = admin
      .from('knowledge_nodes')
      .select('id, kind, title, domain, connections, client_id')
      .order('updated_at', { ascending: false })
      .limit(limit);

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
      query = query.eq('client_id', clientIdParam);
    }

    const { data: nodes, error } = await query;

    if (error) {
      console.error('Knowledge graph query error:', error);
      return NextResponse.json({ error: 'Failed to fetch graph data' }, { status: 500 });
    }

    // Build edges from connections arrays
    // Node IDs are "kind:slug" but connections store raw slugs from the AC KG frontmatter.
    // Build a lookup from raw slug → full composite ID so we can match.
    const nodeIds = new Set((nodes ?? []).map((n) => n.id));
    const slugToId = new Map<string, string>();
    for (const n of nodes ?? []) {
      // Map the slug part (after "kind:") to the full ID
      const colonIdx = (n.id as string).indexOf(':');
      if (colonIdx !== -1) {
        slugToId.set((n.id as string).slice(colonIdx + 1), n.id as string);
      }
      // Also map the full ID to itself (for connections that might already be composite)
      slugToId.set(n.id as string, n.id as string);
    }

    const edges: { source: string; target: string }[] = [];
    const seenEdges = new Set<string>();

    for (const node of nodes ?? []) {
      const connections = (node.connections as string[]) ?? [];
      for (const connRef of connections) {
        // Resolve the connection reference to a full node ID
        const targetId = slugToId.get(connRef);
        if (!targetId) continue;
        const edgeKey = [node.id, targetId].sort().join('::');
        if (seenEdges.has(edgeKey)) continue;
        seenEdges.add(edgeKey);
        edges.push({ source: node.id as string, target: targetId });
      }
    }

    return NextResponse.json({
      nodes: (nodes ?? []).map((n) => ({
        id: n.id,
        kind: n.kind,
        title: n.title,
        domain: n.domain ?? [],
        client_id: n.client_id,
      })),
      edges,
    });
  } catch (error) {
    console.error('GET /api/knowledge/graph error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
