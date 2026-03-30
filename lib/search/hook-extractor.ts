import type { ScoredVideo, HookPattern } from '@/lib/scrapers/types';
import { createCompletion } from '@/lib/ai/client';

/**
 * Extract hook text from video descriptions/titles.
 * Uses the first line or first sentence as the "hook" — the opening that grabs attention.
 */
export function extractHookFromText(text: string | null): string | null {
  if (!text) return null;
  const cleaned = text.trim();
  if (!cleaned) return null;

  // Take first line (many TikTok captions lead with the hook)
  const firstLine = cleaned.split('\n')[0].trim();

  // If first line is very short (just hashtags), skip
  if (firstLine.length < 5 || firstLine.startsWith('#')) {
    // Try the full text up to first sentence break
    const sentenceMatch = cleaned.match(/^(.+?[.!?])\s/);
    if (sentenceMatch) return sentenceMatch[1].substring(0, 200);
    return cleaned.substring(0, 200);
  }

  // Remove trailing hashtags from the hook line
  const withoutTags = firstLine.replace(/\s*#\w+\s*/g, '').trim();
  return withoutTags.substring(0, 200) || null;
}

/**
 * Populate hook_text on scored videos from their descriptions/titles.
 */
export function extractHooksFromVideos(videos: ScoredVideo[]): ScoredVideo[] {
  return videos.map(v => ({
    ...v,
    hook_text: v.hook_text ?? extractHookFromText(v.description ?? v.title),
  }));
}

/**
 * Use LLM to cluster hooks into patterns.
 * Takes hooks from top-performing videos and groups them by similarity.
 */
export async function clusterHookPatterns(
  videos: ScoredVideo[],
  opts?: { userId?: string; userEmail?: string },
): Promise<HookPattern[]> {
  // Only process videos that have hooks
  const withHooks = videos.filter(v => v.hook_text && v.hook_text.length > 5);
  if (withHooks.length < 3) return [];

  // Sort by views desc, take top 100 hooks for clustering
  const topVideos = [...withHooks]
    .sort((a, b) => b.views - a.views)
    .slice(0, 100);

  const hookList = topVideos.map((v, i) =>
    `[${i}] (${formatViews(v.views)} views, ${v.outlier_score.toFixed(1)}x outlier) "${v.hook_text}"`,
  ).join('\n');

  const prompt = `Analyze these video hooks and identify recurring patterns. Group them into 5-15 hook patterns.

Hooks:
${hookList}

Return JSON only:
{
  "patterns": [
    {
      "pattern": "POV: you [relatable scenario]",
      "description": "Point-of-view hooks that place viewer in a scenario",
      "video_indices": [0, 3, 12],
      "avg_views": 150000,
      "avg_outlier": 8.5
    }
  ]
}

Rules:
- Pattern should be a template with brackets for variable parts
- Only include patterns that appear in 2+ videos
- Sort by avg_views descending
- Keep pattern names concise (under 60 chars)`;

  try {
    const result = await createCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 3000,
      feature: 'topic_search_hooks',
      userId: opts?.userId,
      userEmail: opts?.userEmail,
    });

    const parsed = JSON.parse(
      result.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim(),
    ) as {
      patterns?: {
        pattern: string;
        video_indices?: number[];
        avg_views?: number;
        avg_outlier?: number;
      }[];
    };

    return (parsed.patterns ?? []).map(p => {
      const indices = p.video_indices ?? [];
      const exampleIds = indices
        .filter(i => i < topVideos.length)
        .map(i => `${topVideos[i].platform}:${topVideos[i].platform_id}`)
        .slice(0, 5);

      return {
        pattern: p.pattern,
        video_count: indices.length,
        avg_views: Math.round(p.avg_views ?? 0),
        avg_outlier_score: Math.round((p.avg_outlier ?? 0) * 100) / 100,
        example_video_ids: exampleIds,
      };
    });
  } catch (error) {
    console.error('[hook-extractor] LLM clustering failed:', error instanceof Error ? error.message : error);
    return [];
  }
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}
