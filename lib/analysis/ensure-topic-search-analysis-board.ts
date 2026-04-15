import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * One moodboard board per topic search for inline video analysis (sources rail).
 * Reuses `source_topic_search_id` on `moodboard_boards`.
 */
export async function ensureAnalysisBoardForTopicSearch(
  adminClient: SupabaseClient,
  userId: string,
  topicSearchId: string,
): Promise<{ ok: true; boardId: string } | { ok: false; status: number; error: string }> {
  const { data: existing } = await adminClient
    .from('moodboard_boards')
    .select('id')
    .eq('source_topic_search_id', topicSearchId)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    return { ok: true, boardId: existing.id as string };
  }

  const { data: search, error: searchErr } = await adminClient
    .from('topic_searches')
    .select('id, query, client_id')
    .eq('id', topicSearchId)
    .single();

  if (searchErr || !search) {
    return { ok: false, status: 404, error: 'Topic search not found' };
  }

  const q = (search.query as string) ?? 'Research';
  const name = `Analysis — ${q.length > 80 ? `${q.slice(0, 80)}…` : q}`;

  // Topic searches are always tied to a client, so the analysis board is
  // scope='client'. That's also what unlocks viewer access via
  // requireBoardAccess — without the scope set, viewers can't reach it.
  // If a search somehow has no client_id we fall back to 'team' scope so
  // the insert doesn't fail the moodboard_boards_scope_ownership_chk.
  const clientId = (search.client_id as string | null) ?? null;
  const scope: 'client' | 'team' = clientId ? 'client' : 'team';

  const { data: board, error: boardErr } = await adminClient
    .from('moodboard_boards')
    .insert({
      name,
      description: 'Inline video analysis from topic search sources',
      client_id: clientId,
      created_by: userId,
      source_topic_search_id: topicSearchId,
      scope,
      is_personal: false,
    })
    .select('id')
    .single();

  if (boardErr || !board) {
    return { ok: false, status: 500, error: 'Failed to create analysis board' };
  }

  return { ok: true, boardId: board.id as string };
}
