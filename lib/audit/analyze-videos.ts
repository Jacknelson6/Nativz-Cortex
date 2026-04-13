/**
 * Gemini per-video grader for the audit pipeline.
 * Calls OpenRouter (Gemini 2.0 Flash) with a thumbnail + caption prompt
 * and returns a structured VideoAudit for each video.
 */

import { z } from 'zod';
import { parseAIResponseJSON } from '@/lib/ai/parse';
import { createOpenRouterRichCompletion } from '@/lib/ai/openrouter-rich';
import type { AuditPlatform, ProspectVideo } from './types';

const MODEL =
  process.env.OPENROUTER_AUDIT_VISION_MODEL?.trim() || 'google/gemini-2.0-flash-001';

const VIDEOS_PER_PLATFORM = 5;
const MIN_VIDEOS_TO_GRADE = 3;
const CONCURRENCY = 5;

export const VideoAuditSchema = z.object({
  hook_type: z.enum(['question', 'stat', 'story', 'demo', 'controversy', 'none']),
  hook_strength: z.number().int().min(1).max(5),
  format: z.string().min(1),
  quality_grade: z.enum(['high', 'medium', 'low']),
  visual_elements: z.array(z.string()).default([]),
});

export type VideoAudit = z.infer<typeof VideoAuditSchema>;

const PROMPT = `You are grading a short-form video for a sales analysis.
Given the caption and thumbnail, score the video for:
- hook_type: the opening hook pattern. "question" | "stat" | "story" | "demo" | "controversy" | "none"
- hook_strength: 1-5 (5 = strongest)
- format: 1-3 word label e.g. "talking-head", "product-demo", "montage"
- quality_grade: "high" (pro lighting/framing, crisp visuals) | "medium" | "low" (shaky, dim, unclear)
- visual_elements: short tags of visible elements (e.g. "text-overlay", "b-roll")

Return ONLY JSON matching:
{"hook_type":"...","hook_strength":1,"format":"...","quality_grade":"...","visual_elements":["..."]}
`;

export async function analyzeVideoForAudit(video: ProspectVideo): Promise<VideoAudit> {
  const userText = `Caption: ${video.description || '(none)'}\nPlatform: ${video.platform}\nDuration: ${video.duration ?? 'unknown'}s\nViews: ${video.views}`;
  const thumbnail = video.thumbnailUrl;

  try {
    const result = await createOpenRouterRichCompletion({
      messages: [
        { role: 'system', content: PROMPT },
        {
          role: 'user',
          content: thumbnail
            ? [
                { type: 'text', text: userText },
                { type: 'image_url', image_url: { url: thumbnail } },
              ]
            : userText,
        },
      ],
      maxTokens: 400,
      temperature: 0.2,
      feature: 'audit_video_grade',
      modelPreference: [MODEL],
    });

    const parsed = parseAIResponseJSON<unknown>(result.text);
    return VideoAuditSchema.parse(parsed);
  } catch (err) {
    console.warn('[audit.analyze-videos] Gemini grade failed, using none/low fallback:', err);
    return {
      hook_type: 'none',
      hook_strength: 1,
      format: 'unknown',
      quality_grade: 'low',
      visual_elements: [],
    };
  }
}

/**
 * Grade the top-N videos per platform for one brand.
 * Platforms with fewer than MIN_VIDEOS_TO_GRADE videos return `[]` so the
 * scorecard can render `—` with the "not enough videos" tooltip.
 */
export async function analyzeVideosForBrand(
  videosByPlatform: Partial<Record<AuditPlatform, ProspectVideo[]>>,
): Promise<Record<AuditPlatform, VideoAudit[]>> {
  const out: Record<AuditPlatform, VideoAudit[]> = {
    tiktok: [],
    instagram: [],
    facebook: [],
    youtube: [],
    linkedin: [],
  };

  for (const [platformKey, videos] of Object.entries(videosByPlatform) as [
    AuditPlatform,
    ProspectVideo[],
  ][]) {
    if (!videos || videos.length < MIN_VIDEOS_TO_GRADE) {
      out[platformKey] = [];
      continue;
    }
    const top = [...videos].sort((a, b) => b.views - a.views).slice(0, VIDEOS_PER_PLATFORM);
    out[platformKey] = await runWithConcurrency(
      top.map((v) => () => analyzeVideoForAudit(v)),
      CONCURRENCY,
    );
  }

  return out;
}

async function runWithConcurrency<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let cursor = 0;

  async function worker() {
    while (cursor < tasks.length) {
      const i = cursor++;
      results[i] = await tasks[i]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, worker);
  await Promise.all(workers);
  return results;
}
