import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/knowledge/graph
 *
 * Get graph data (lightweight nodes + edges derived from connections arrays).
 * When a specific client_id is provided, also includes that client's
 * knowledge entries (scraped pages, brand profile, meetings) from
 * client_knowledge_entries as additional graph nodes.
 *
 * @query kind - Filter by kind(s), comma-separated
 * @query domain - Filter by domain(s), comma-separated
 * @query client_id - Filter by client (use "agency" for client_id IS NULL)
 * @query limit - Max nodes (default 2000)
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
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '2000', 10), 5000);

    const admin = createAdminClient();

    // ── Fetch knowledge_nodes ──────────────────────────────────────────────

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

    // Run knowledge_nodes query + optional client_knowledge_entries in parallel
    const isClientQuery = clientIdParam && clientIdParam !== 'agency';
    const clientEntriesPromise = isClientQuery
      ? admin
          .from('client_knowledge_entries')
          .select('id, type, title, client_id')
          .eq('client_id', clientIdParam)
          .order('created_at', { ascending: false })
          .limit(200)
      : null;

    const [nodesResult, clientEntriesResult] = await Promise.all([
      query,
      clientEntriesPromise,
    ]);

    const { data: nodes, error } = nodesResult;

    if (error) {
      console.error('Knowledge graph query error:', error);
      return NextResponse.json({ error: 'Failed to fetch graph data' }, { status: 500 });
    }

    const clientEntries = clientEntriesResult?.data ?? null;

    // ── Build edges from connections arrays ─────────────────────────────────

    const nodeIds = new Set((nodes ?? []).map((n) => n.id));
    const slugToId = new Map<string, string>();
    for (const n of nodes ?? []) {
      const colonIdx = (n.id as string).indexOf(':');
      if (colonIdx !== -1) {
        slugToId.set((n.id as string).slice(colonIdx + 1), n.id as string);
      }
      slugToId.set(n.id as string, n.id as string);
    }

    const edges: { source: string; target: string }[] = [];
    const seenEdges = new Set<string>();

    for (const node of nodes ?? []) {
      const connections = (node.connections as string[]) ?? [];
      for (const connRef of connections) {
        const targetId = slugToId.get(connRef);
        if (!targetId) continue;
        const edgeKey = [node.id, targetId].sort().join('::');
        if (seenEdges.has(edgeKey)) continue;
        seenEdges.add(edgeKey);
        edges.push({ source: node.id as string, target: targetId });
      }
    }

    // ── Merge client_knowledge_entries when a specific client is selected ───

    const outputNodes = (nodes ?? []).map((n) => ({
      id: n.id as string,
      kind: n.kind as string,
      title: n.title as string,
      domain: (n.domain as string[]) ?? [],
      client_id: n.client_id as string | null,
    }));

    if (clientEntries && clientEntries.length > 0) {
      const typeToKind: Record<string, string> = {
        web_page: 'web-page',
        brand_profile: 'brand-profile',
        brand_guideline: 'brand-guideline',
        meeting_note: 'meeting',
        note: 'asset',
        document: 'asset',
        idea: 'insight',
        brand_asset: 'asset',
        // Brand DNA sub-types
        visual_identity: 'visual-identity',
        verbal_identity: 'verbal-identity',
        target_audience: 'target-audience',
        competitive_positioning: 'competitive-positioning',
        product_catalog: 'product-catalog',
        brand_logo: 'brand-logo',
        brand_screenshot: 'brand-screenshot',
      };

      // Find parent client node to connect entries to
      const parentNodeId = outputNodes.find(
        (n) => n.kind === 'client' && n.client_id === clientIdParam,
      )?.id ?? outputNodes.find((n) => n.kind === 'client')?.id;

      // Hoist brand profile lookup outside loop (O(1) instead of O(n) per web_page)
      const brandProfile = clientEntries.find((e) => e.type === 'brand_profile');
      const brandProfileNodeId = brandProfile ? `cke:${brandProfile.id}` : null;

      for (const entry of clientEntries) {
        const entryNodeId = `cke:${entry.id}`;
        const kind = typeToKind[entry.type as string] ?? 'asset';

        outputNodes.push({
          id: entryNodeId,
          kind,
          title: (entry.title as string) ?? 'Untitled',
          domain: [],
          client_id: entry.client_id as string,
        });

        // Connect to client node
        if (parentNodeId) {
          const edgeKey = [entryNodeId, parentNodeId].sort().join('::');
          if (!seenEdges.has(edgeKey)) {
            seenEdges.add(edgeKey);
            edges.push({ source: parentNodeId, target: entryNodeId });
          }
        }

        // Connect web pages to brand profile
        if (entry.type === 'web_page' && brandProfileNodeId) {
          const bpEdgeKey = [entryNodeId, brandProfileNodeId].sort().join('::');
          if (!seenEdges.has(bpEdgeKey)) {
            seenEdges.add(bpEdgeKey);
            edges.push({ source: brandProfileNodeId, target: entryNodeId });
          }
        }
      }
    }

    // ── Fetch client_knowledge_links for edges between CKE nodes ────────────

    if (isClientQuery) {
      const { data: clientLinks } = await admin
        .from('client_knowledge_links')
        .select('source_id, target_id, label')
        .eq('client_id', clientIdParam);

      for (const link of clientLinks ?? []) {
        const sourceId = `cke:${link.source_id}`;
        const targetId = `cke:${link.target_id}`;
        const edgeKey = [sourceId, targetId].sort().join('::');
        if (!seenEdges.has(edgeKey)) {
          seenEdges.add(edgeKey);
          edges.push({ source: sourceId, target: targetId });
        }
      }
    }

    return NextResponse.json({
      nodes: outputNodes,
      edges,
    });
  } catch (error) {
    console.error('GET /api/knowledge/graph error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
