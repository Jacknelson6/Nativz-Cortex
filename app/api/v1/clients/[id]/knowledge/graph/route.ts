import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-keys/validate';
import { getKnowledgeGraph } from '@/lib/knowledge/queries';

/**
 * GET /api/v1/clients/[id]/knowledge/graph
 *
 * Fetch the knowledge graph for a client — nodes (entries) and edges (links).
 * Used for visualization and agent traversal of the client's knowledge base.
 *
 * @auth API key (Bearer token via Authorization header)
 * @param id - Client UUID
 * @returns {{ nodes: KnowledgeNode[], edges: KnowledgeEdge[] }}
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await validateApiKey(request);
  if ('error' in auth) return auth.error;

  try {
    const { id: clientId } = await params;

    const graph = await getKnowledgeGraph(clientId);

    return NextResponse.json(graph);
  } catch (error) {
    console.error('GET /api/v1/clients/[id]/knowledge/graph error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
