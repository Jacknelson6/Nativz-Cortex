import { parseAIResponseJSON } from '@/lib/ai/parse';
import { logUsage } from '@/lib/ai/usage';
import { z } from 'zod';

const VISION_MODEL =
  process.env.OPENROUTER_VISION_CLIP_MODEL?.trim() || 'google/gemini-2.0-flash-001';

const MAX_FRAMES = 14;

const responseSchema = z.object({
  overall_summary: z.string(),
  clips: z.array(
    z.object({
      start_sec: z.number(),
      end_sec: z.number(),
      clip_type: z.string(),
      on_screen: z.string(),
      confidence: z.number().min(0).max(1).optional(),
    }),
  ),
});

export interface VisionClipSegment {
  startSec: number;
  endSec: number;
  clipType: string;
  onScreen: string;
  confidence: number;
}

export interface VisionClipBreakdown {
  overallSummary: string;
  clips: VisionClipSegment[];
  analyzedAt: string;
  modelUsed: string;
}

/**
 * Call OpenRouter with ordered still frames to infer clip types (b-roll, talking head, meme, etc.)
 * and short on-screen descriptions. Best-effort — returns null on failure.
 */
export async function analyzeVisionClipBreakdown(params: {
  frames: { url: string; timestamp: number }[];
  videoDurationSec: number;
  userId?: string;
  userEmail?: string;
}): Promise<VisionClipBreakdown | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.warn('vision-clip-breakdown: OPENROUTER_API_KEY missing');
    return null;
  }

  if (params.frames.length === 0) return null;

  const sorted = [...params.frames].sort((a, b) => a.timestamp - b.timestamp);
  const take = sorted.length <= MAX_FRAMES ? sorted : evenlySample(sorted, MAX_FRAMES);

  const system = `You are a short-form vertical video (TikTok/Reels) analyst for a marketing agency.
You receive still frames in chronological order with their timestamps in the video.
Infer how the video is cut and what each stretch is showing — not just "face vs no face", but format and intent.

clip_type MUST be one of:
- talking_head (person speaking to camera, vlog-style)
- b_roll (environmental cutaways, hands-only, food prep, scenery without direct address)
- meme_or_reaction (reaction face, stitched meme format, duet-style reaction)
- text_overlay_heavy (large captions / text takes over the frame)
- screen_recording (app UI, website, gameplay)
- product_focus (product hero shot, unboxing close-up, packaging)
- dance_or_trend (choreography, lip-sync performance to trend audio)
- montage (rapid unrelated visuals, mash-up)
- transition (flash, whip pan, hard graphic cut — often between scenes)
- other

Return ONLY valid JSON (no markdown) with this shape:
{
  "overall_summary": "1-2 sentences on what the video is doing visually",
  "clips": [
    {
      "start_sec": 0,
      "end_sec": 3,
      "clip_type": "talking_head",
      "on_screen": "Single short sentence: what the viewer sees",
      "confidence": 0.85
    }
  ]
}

Rules:
- clips must cover 0 to video end (~${Math.round(params.videoDurationSec)}s) without large gaps; merge similar adjacent stretches.
- confidence is 0-1 optional; default missing to 0.7 in your reasoning.
- Use timestamps from the provided frames to anchor start_sec/end_sec.`;

  const lines = take.map((f, i) => `Still ${i + 1} at ${f.timestamp}s — use this moment to label nearby segments.`);
  const userText = `${lines.join('\n')}\n\nVideo length ~${Math.round(params.videoDurationSec)}s.`;

  const contentParts: Record<string, unknown>[] = [];
  for (const f of take) {
    contentParts.push({
      type: 'image_url',
      image_url: { url: f.url },
    });
  }
  contentParts.push({ type: 'text', text: userText });

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        'X-Title': 'Nativz Cortex',
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        max_tokens: 2500,
        temperature: 0.25,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: contentParts },
        ],
      }),
      signal: AbortSignal.timeout(55000),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('vision-clip-breakdown OpenRouter error:', response.status, errBody.slice(0, 400));
      return null;
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const raw = data.choices?.[0]?.message?.content ?? '';
    if (!raw.trim()) return null;

    const parsed = parseAIResponseJSON<Record<string, unknown>>(raw);
    const rawClips = (parsed.clips as Record<string, unknown>[] | undefined) ?? [];
    const normalized = {
      overall_summary: String(parsed.overall_summary ?? ''),
      clips: rawClips.map((c) => ({
        start_sec: Number(c.start_sec ?? c.startSec ?? 0),
        end_sec: Number(c.end_sec ?? c.endSec ?? 0),
        clip_type: String(c.clip_type ?? c.clipType ?? 'other'),
        on_screen: String(c.on_screen ?? c.onScreen ?? ''),
        confidence: typeof c.confidence === 'number' ? c.confidence : 0.7,
      })),
    };

    const safe = responseSchema.safeParse(normalized);
    if (!safe.success) {
      console.warn('vision-clip-breakdown: schema validation failed', safe.error.flatten());
      return null;
    }

    const usage = data.usage;
    await logUsage({
      service: 'openrouter',
      model: VISION_MODEL,
      feature: 'moodboard_vision_clip_breakdown',
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
      totalTokens: (usage?.prompt_tokens ?? 0) + (usage?.completion_tokens ?? 0),
      costUsd: 0,
      userId: params.userId,
      userEmail: params.userEmail,
    }).catch(() => {});

    return {
      overallSummary:
        safe.data.overall_summary.trim() ||
        'Visual breakdown from extracted frames (short-form video).',
      clips: safe.data.clips.map((c) => ({
        startSec: c.start_sec,
        endSec: c.end_sec,
        clipType: c.clip_type,
        onScreen: c.on_screen,
        confidence: c.confidence ?? 0.7,
      })),
      analyzedAt: new Date().toISOString(),
      modelUsed: VISION_MODEL,
    };
  } catch (e) {
    console.error('vision-clip-breakdown:', e);
    return null;
  }
}

function evenlySample<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const out: T[] = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.round((i / (n - 1)) * (arr.length - 1));
    out.push(arr[idx]);
  }
  return out;
}
