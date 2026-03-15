import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getKnowledgeGraph } from '@/lib/knowledge/queries';

/**
 * GET /api/clients/[id]/knowledge/graph
 *
 * Fetch the knowledge graph for a client — nodes (entries, contacts, searches) and edges
 * (knowledge links) for visualization in the knowledge graph UI.
 *
 * @auth Required (any authenticated user)
 * @param id - Client UUID
 * @returns {{ nodes: GraphNode[], edges: GraphEdge[] }}
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: clientId } = await params;

    const graph = await getKnowledgeGraph(clientId);

    return NextResponse.json(graph);
  } catch (error) {
    console.error('GET /api/clients/[id]/knowledge/graph error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
