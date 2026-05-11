// VFF-10 T05: Nerd tool that resolves a free-text format name (e.g.
// "comparison", "POV story", "fast cuts") to a row in viral_formats.
// Used when the user asks for a script "in <X> format" and the Nerd
// needs the canonical slug + a worked example before reaching for
// `create_topic_plan` or surfacing analysis from the library.

import { z } from 'zod';
import { ToolDefinition } from '../types';
import { createAdminClient } from '@/lib/supabase/admin';

const ResolveFormatSchema = z.object({
  name_or_slug: z.string().min(1).max(80),
});

interface FormatRow {
  id: string;
  kind: 'hook_type' | 'structure' | 'archetype' | 'pacing';
  slug: string;
  display_name: string;
  description: string | null;
  aliases: string[] | null;
  example_video_id: string | null;
  archived_at: string | null;
}

interface ExampleVideoRow {
  id: string;
  platform: string;
  source_url: string;
  engagement_hook_descriptor: string | null;
}

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/[_\s-]+/g, ' ');
}

// Cheap Jaccard-token similarity over normalized words. Good enough for
// "comparison" vs "comparison_play" or "POV story" vs "pov_story"
// without standing up pg_trgm yet — and it works the same locally /
// in CI / on Vercel without a DB extension dependency.
function similarity(a: string, b: string): number {
  const sa = new Set(normalize(a).split(' ').filter(Boolean));
  const sb = new Set(normalize(b).split(' ').filter(Boolean));
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter += 1;
  return inter / new Set([...sa, ...sb]).size;
}

const resolveFormat: ToolDefinition = {
  name: 'resolve_format',
  description:
    'Resolve a free-text format name (e.g. "comparison play", "POV story", "fast cuts") to the canonical viral_formats row plus a worked example. Use this when the user asks for a script "in <X> format" or references a format by name — you need the slug + example before calling create_topic_plan or pulling analysis. Returns the exact match if found, otherwise the top 3 similar slugs as suggestions.',
  parameters: ResolveFormatSchema,
  riskLevel: 'read',
  handler: async (params) => {
    const { name_or_slug } = params as z.infer<typeof ResolveFormatSchema>;
    const admin = createAdminClient();
    const input = normalize(name_or_slug);

    const { data: rows, error } = await admin
      .from('viral_formats')
      .select('id, kind, slug, display_name, description, aliases, example_video_id, archived_at')
      .is('archived_at', null);
    if (error) return { success: false, error: error.message };

    const formats = (rows ?? []) as FormatRow[];
    if (formats.length === 0) {
      return { success: true, data: { match: null, suggestions: [] } };
    }

    // Exact slug / display_name / alias hit wins outright.
    const exact = formats.find((f) => {
      const candidates = [f.slug, f.display_name, ...(f.aliases ?? [])].map(normalize);
      return candidates.includes(input);
    });

    const pickWinner = exact ?? bestFuzzy(formats, input);

    if (!pickWinner) {
      const suggestions = topN(formats, input, 3).map((f) => f.slug);
      return { success: true, data: { match: null, suggestions } };
    }

    let workedExample: ExampleVideoRow | null = null;
    if (pickWinner.example_video_id) {
      const { data } = await admin
        .from('viral_videos')
        .select('id, platform, source_url, engagement_hook_descriptor')
        .eq('id', pickWinner.example_video_id)
        .maybeSingle();
      if (data) workedExample = data as ExampleVideoRow;
    }
    if (!workedExample) {
      // Fall back: pick the top-views analyzed video tagged with this format.
      const { data: vvf } = await admin
        .from('viral_video_formats')
        .select('video_id')
        .eq('format_id', pickWinner.id)
        .limit(20);
      const ids = (vvf ?? []).map((r: { video_id: string }) => r.video_id);
      if (ids.length > 0) {
        const { data: top } = await admin
          .from('viral_videos')
          .select('id, platform, source_url, engagement_hook_descriptor')
          .in('id', ids)
          .eq('analysis_status', 'analyzed')
          .order('views_count', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();
        if (top) workedExample = top as ExampleVideoRow;
      }
    }

    return {
      success: true,
      data: {
        match: {
          kind: pickWinner.kind,
          slug: pickWinner.slug,
          display_name: pickWinner.display_name,
          definition: pickWinner.description,
          worked_example: workedExample,
        },
        suggestions: [] as string[],
      },
    };
  },
};

function bestFuzzy(formats: FormatRow[], input: string): FormatRow | null {
  let best: { row: FormatRow; score: number } | null = null;
  for (const f of formats) {
    const candidates = [f.slug, f.display_name, ...(f.aliases ?? [])];
    for (const c of candidates) {
      const score = similarity(c, input);
      if (score >= 0.4 && (!best || score > best.score)) {
        best = { row: f, score };
      }
    }
  }
  return best?.row ?? null;
}

function topN(formats: FormatRow[], input: string, n: number): FormatRow[] {
  const ranked = formats
    .map((f) => {
      const candidates = [f.slug, f.display_name, ...(f.aliases ?? [])];
      const score = Math.max(...candidates.map((c) => similarity(c, input)));
      return { f, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((r) => r.f);
  return ranked;
}

export const formatTools: ToolDefinition[] = [resolveFormat];

export const __TEST__ = { normalize, similarity, bestFuzzy, topN };
