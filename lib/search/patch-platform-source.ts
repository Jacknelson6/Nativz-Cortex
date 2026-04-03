import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlatformSource, SearchPlatform } from '@/lib/types/search';

/**
 * Merge fields into a single source row inside `topic_searches.platform_data.sources`.
 */
export async function patchPlatformSourceInSearch(
  admin: SupabaseClient,
  searchId: string,
  platform: SearchPlatform,
  sourceId: string,
  patch: Partial<PlatformSource>,
): Promise<{ ok: true; updated: PlatformSource } | { ok: false; error: string; status?: number }> {
  const { data: row, error } = await admin
    .from('topic_searches')
    .select('platform_data')
    .eq('id', searchId)
    .single();

  if (error || !row) {
    return { ok: false, error: 'Search not found', status: 404 };
  }

  const pd = (row.platform_data as Record<string, unknown> | null | undefined) ?? {};
  const sources = Array.isArray(pd.sources) ? [...(pd.sources as PlatformSource[])] : [];

  const idx = sources.findIndex((s) => s.platform === platform && s.id === sourceId);
  if (idx === -1) {
    return { ok: false, error: 'Source not found on this search', status: 404 };
  }

  const merged = { ...sources[idx], ...patch } as PlatformSource;
  sources[idx] = merged;

  const { error: upErr } = await admin
    .from('topic_searches')
    .update({
      platform_data: {
        ...pd,
        sources,
      },
    })
    .eq('id', searchId);

  if (upErr) {
    return { ok: false, error: upErr.message || 'Update failed', status: 500 };
  }

  return { ok: true, updated: merged };
}
