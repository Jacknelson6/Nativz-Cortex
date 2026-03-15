import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/ideas/saved
 *
 * List all saved ideas from the knowledge base. Returns knowledge entries of type 'idea'
 * across all clients, ordered by creation date descending (max 200).
 *
 * @auth Required (any authenticated user)
 * @returns {{ ideas: KnowledgeEntry[] }} Array of saved idea entries
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data } = await admin
    .from('client_knowledge_entries')
    .select('id, client_id, title, content, metadata, source, created_at')
    .eq('type', 'idea')
    .order('created_at', { ascending: false })
    .limit(200);

  return NextResponse.json({ ideas: data ?? [] });
}
