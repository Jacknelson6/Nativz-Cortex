import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-keys/validate';
import { getKnowledgeGraph } from '@/lib/knowledge/queries';

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
