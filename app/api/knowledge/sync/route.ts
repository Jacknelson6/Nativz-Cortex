import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { KNOWLEDGE_GRAPH_GITHUB_REPO } from '@/lib/knowledge/github-repo';
import { syncFromGitHub } from '@/lib/knowledge/github-sync';

const syncSchema = z.object({
  repo: z.string().optional(),
});

/**
 * POST /api/knowledge/sync
 *
 * Trigger GitHub → Supabase incremental sync for the knowledge graph.
 *
 * Auth: admin role OR x-sync-secret header matching SYNC_SECRET env var.
 * Body: { repo?: string } — defaults to KNOWLEDGE_GRAPH_GITHUB_REPO (see lib/knowledge/github-repo.ts)
 */
export async function POST(request: NextRequest) {
  try {
    // Auth: check admin role OR sync secret
    const syncSecret = request.headers.get('x-sync-secret');
    const isSecretAuth = syncSecret && process.env.SYNC_SECRET && syncSecret === process.env.SYNC_SECRET;

    if (!isSecretAuth) {
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
    }

    const body = await request.json().catch(() => ({}));
    const parsed = syncSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const repo = parsed.data.repo ?? KNOWLEDGE_GRAPH_GITHUB_REPO;
    const stats = await syncFromGitHub(repo);

    return NextResponse.json(stats);
  } catch (error) {
    console.error('POST /api/knowledge/sync error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
