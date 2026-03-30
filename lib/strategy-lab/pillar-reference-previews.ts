import type { SupabaseClient } from '@supabase/supabase-js';

export type PillarReferencePreview = {
  thumbnailUrl: string | null;
  referenceVideoUrl: string | null;
};

/**
 * For each pillar, find the most recent completed idea generation that used that pillar
 * and had reference videos; return thumbnail + video URL from `reference_videos`.
 */
export async function loadPillarReferencePreviews(
  admin: SupabaseClient,
  clientId: string,
  pillarIds: string[],
): Promise<Record<string, PillarReferencePreview>> {
  if (pillarIds.length === 0) return {};

  const { data: gens, error } = await admin
    .from('idea_generations')
    .select('pillar_ids, reference_video_ids, completed_at')
    .eq('client_id', clientId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(120);

  if (error || !gens?.length) {
    return {};
  }

  const firstVideoByPillar = new Map<string, string>();
  for (const row of gens) {
    const pids = row.pillar_ids as string[] | null;
    const refIds = row.reference_video_ids as string[] | null;
    if (!pids?.length || !refIds?.length) continue;
    for (const pid of pids) {
      if (!pillarIds.includes(pid)) continue;
      if (!firstVideoByPillar.has(pid)) {
        firstVideoByPillar.set(pid, refIds[0]);
      }
    }
  }

  const videoIds = [...new Set([...firstVideoByPillar.values()])];
  if (videoIds.length === 0) return {};

  const { data: videos } = await admin
    .from('reference_videos')
    .select('id, url, thumbnail_url')
    .in('id', videoIds);

  const byId = new Map((videos ?? []).map((v) => [v.id as string, v]));
  const out: Record<string, PillarReferencePreview> = {};
  for (const pid of pillarIds) {
    const vid = firstVideoByPillar.get(pid);
    if (!vid) continue;
    const v = byId.get(vid);
    out[pid] = {
      thumbnailUrl: (v?.thumbnail_url as string | null) ?? null,
      referenceVideoUrl: (v?.url as string | null) ?? null,
    };
  }
  return out;
}
