// SPY-10 T06: build the structured payload for a monthly_format digest.
//
// Queries the VFF library for the top 5 niche-relevant formats over the
// last 30 days. "Niche-relevant" is best-effort: we filter formats whose
// videos have been analyzed in the last 30 days; we don't yet have a
// per-prospect niche taxonomy wire-up, so v1 returns the 5 most-tagged
// formats globally and flags `evergreen=true` if there are no recent
// analyzed videos (PRD edge case).

import { createAdminClient } from '@/lib/supabase/admin';
import type { MonthlyFormatPayload } from './types';

function clamp(s: string, n: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 3)}...` : t;
}

export interface BuildMonthlyFormatPayloadInput {
  prospectId: string;
  ctaUrl: string;
  now?: Date;
}

export async function buildMonthlyFormatPayload(
  input: BuildMonthlyFormatPayloadInput,
): Promise<MonthlyFormatPayload> {
  const admin = createAdminClient();
  const now = input.now ?? new Date();
  const monthIso = now.toISOString().slice(0, 7);
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // 1) Recent format tags (last 30d).
  const { data: recentTags } = await admin
    .from('viral_video_formats')
    .select('format_id, video_id, viral_videos!inner(analyzed_at, source_url)')
    .gte('viral_videos.analyzed_at', from);

  const formatCounts = new Map<string, { count: number; samples: string[] }>();
  for (const row of (recentTags ?? []) as unknown as Array<{
    format_id: string;
    viral_videos: { source_url: string | null } | { source_url: string | null }[] | null;
  }>) {
    const fid = row.format_id;
    const slot = formatCounts.get(fid) ?? { count: 0, samples: [] };
    slot.count += 1;
    const vv = row.viral_videos;
    const url = Array.isArray(vv) ? vv[0]?.source_url ?? null : vv?.source_url ?? null;
    if (url && slot.samples.length < 3) slot.samples.push(url);
    formatCounts.set(fid, slot);
  }

  let evergreen = false;
  let topFormatIds: string[] = Array.from(formatCounts.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([id]) => id);

  if (topFormatIds.length === 0) {
    // Evergreen fallback: latest 5 seeded formats.
    const { data: seeded } = await admin
      .from('viral_formats')
      .select('id')
      .eq('is_seeded', true)
      .order('created_at', { ascending: false })
      .limit(5);
    topFormatIds = (seeded ?? []).map((r) => r.id);
    evergreen = true;
  }

  if (topFormatIds.length === 0) {
    return {
      formats: [],
      month: monthIso,
      cta_url: input.ctaUrl,
      evergreen: true,
    };
  }

  const { data: formats } = await admin
    .from('viral_formats')
    .select('id, display_name, description')
    .in('id', topFormatIds);

  const formatById = new Map<string, { display_name: string; description: string | null }>();
  for (const f of formats ?? []) formatById.set(f.id, f);

  const orderedFormats = topFormatIds
    .map((id) => {
      const meta = formatById.get(id);
      if (!meta) return null;
      const samples = formatCounts.get(id)?.samples ?? [];
      return {
        format_id: id,
        format_name: meta.display_name,
        why_it_works: clamp(
          meta.description ??
            'High-retention pattern surfacing across short-form right now.',
          240,
        ),
        sample_post_urls: samples,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return {
    formats: orderedFormats,
    month: monthIso,
    cta_url: input.ctaUrl,
    evergreen,
  };
}
