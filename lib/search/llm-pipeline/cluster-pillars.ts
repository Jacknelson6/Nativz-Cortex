/**
 * Cluster TikTok videos into content pillars using an LLM.
 *
 * Input: compact video summaries (caption, transcript snippet, vision types, engagement).
 * Output: 4–6 content pillar clusters with real engagement metrics.
 */

import { createCompletion } from '@/lib/ai/client';
import { parseAIResponseJSON } from '@/lib/ai/parse';
import { getTopicSearchModelsFromDb } from '@/lib/ai/topic-search-models';

export interface PillarCluster {
  name: string;
  description: string;
  video_ids: string[];
  video_count: number;
  avg_engagement_rate: number;
  pct_of_content: number;
  top_video_id: string;
}

export interface ClusterPillarsResult {
  pillars: PillarCluster[];
  tokens: number;
  cost: number;
}

interface VideoSummary {
  id: string;
  caption: string;
  hashtags: string[];
  transcript_snippet: string;
  vision_types: string[];
  views: number;
  likes: number;
  er: number;
}

export async function clusterVideosToPillars(args: {
  query: string;
  videos: VideoSummary[];
  userId: string;
  userEmail?: string;
  clientContext?: { name: string; industry: string | null } | null;
}): Promise<ClusterPillarsResult> {
  const models = await getTopicSearchModelsFromDb();

  // Build compact video list for the prompt
  const videoLines = args.videos
    .slice(0, 500) // safety cap
    .map((v) => {
      const parts = [
        `id:${v.id}`,
        `views:${v.views}`,
        `er:${v.er}%`,
        v.caption ? `caption:"${v.caption}"` : '',
        v.transcript_snippet ? `transcript:"${v.transcript_snippet}"` : '',
        v.vision_types.length > 0 ? `visual:[${v.vision_types.join(',')}]` : '',
      ].filter(Boolean);
      return parts.join(' | ');
    })
    .join('\n');

  const clientLine = args.clientContext
    ? `\nClient: ${args.clientContext.name}${args.clientContext.industry ? ` (${args.clientContext.industry})` : ''}. Consider what content types this client should prioritize.`
    : '';

  const prompt = `You are a content strategist analyzing ${args.videos.length} TikTok videos about "${args.query}".${clientLine}

Cluster these videos into **4–6 content pillar groups**. Each pillar must be a **filmable content type** that a videographer can produce (not an abstract theme).

Videos:
${videoLines}

Return ONLY valid JSON:
{
  "pillars": [
    {
      "name": "3–8 word descriptive label of the content type",
      "description": "One sentence explaining what this content looks like on camera",
      "video_ids": ["id1", "id2", ...],
      "video_count": number,
      "avg_engagement_rate": number (average ER across videos in this cluster),
      "pct_of_content": number (percentage of total videos in this cluster),
      "top_video_id": "id of the highest-engagement video in this cluster"
    }
  ]
}

Rules:
- Every video must belong to exactly one pillar.
- Pillar names must describe filmable content: "Product showcase & unboxings", "How-to tutorials", "Day-in-the-life vlogs" — NOT abstract themes like "Community engagement" or "Cultural relevance".
- Sort pillars by pct_of_content descending (most common first).
- avg_engagement_rate: calculate from the ER values of videos in that cluster. Express as percentage points (e.g. 2.4 means 2.4%).
- pct_of_content must sum to 100.
- video_ids must reference actual video IDs from the input.
- IMPORTANT: Always consider "Talking head & reaction takes" as a potential pillar. This format — where an authority figure reacts to content, critiques competitors, explains industry topics, or gives expert takes on camera — is a high-performing top-of-funnel format. If ANY videos feature someone speaking to camera, reacting, or giving commentary, cluster them here. Prefer this pillar over generic ones like "promotional content", "brand promos", or "action footage". The talking head format includes: expert reactions, stitch/duet responses, "this is what they're doing wrong", opinion pieces, and educational commentary.`;

  const ai = await createCompletion({
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 2000,
    feature: 'topic_search',
    userId: args.userId,
    userEmail: args.userEmail,
    modelPreference: [models.merger],
    jsonMode: true,
  });

  const parsed = parseAIResponseJSON<{ pillars?: PillarCluster[] }>(ai.text);
  const pillars = Array.isArray(parsed?.pillars) ? parsed.pillars : [];

  // Validate and clean up
  const validPillars = pillars
    .filter((p) => p.name && Array.isArray(p.video_ids))
    .map((p) => ({
      name: p.name,
      description: p.description ?? '',
      video_ids: p.video_ids,
      video_count: p.video_count ?? p.video_ids.length,
      avg_engagement_rate: p.avg_engagement_rate ?? 0,
      pct_of_content: p.pct_of_content ?? 0,
      top_video_id: p.top_video_id ?? p.video_ids[0] ?? '',
    }));

  return {
    pillars: validPillars,
    tokens: ai.usage.totalTokens,
    cost: ai.estimatedCost,
  };
}

/**
 * Format pillar clusters into the content_breakdown.categories shape
 * expected by the merger prompt.
 */
export function pillarsToMergerCategories(
  pillars: PillarCluster[],
): { name: string; percentage: number; engagement_rate: number }[] {
  return pillars.map((pillar: PillarCluster) => ({
    name: pillar.name,
    percentage: pillar.pct_of_content,
    engagement_rate: pillar.avg_engagement_rate,
  }));
}
