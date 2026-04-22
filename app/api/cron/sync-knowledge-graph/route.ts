import { NextRequest, NextResponse } from 'next/server';
import { syncAllKnowledgeSources } from '@/lib/knowledge/github-sync';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';

export const maxDuration = 300;

/**
 * GET/POST /api/cron/sync-knowledge-graph
 *
 * Vercel cron: incremental GitHub → Supabase sync for all KNOWLEDGE_GRAPH_SYNC_SOURCES.
 *
 * @auth Bearer CRON_SECRET
 */
async function handle(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!process.env.GITHUB_VAULT_TOKEN) {
      return NextResponse.json(
        { error: 'GITHUB_VAULT_TOKEN is not configured' },
        { status: 400 },
      );
    }

    const results = await syncAllKnowledgeSources();
    console.log('[cron/sync-knowledge-graph]', results);

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error('sync-knowledge-graph cron error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

export const GET = withCronTelemetry(
  { route: '/api/cron/sync-knowledge-graph' },
  async (request: NextRequest) => handle(request),
);

export const POST = withCronTelemetry(
  { route: '/api/cron/sync-knowledge-graph' },
  async (request: NextRequest) => handle(request),
);
