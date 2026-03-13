import { logUsage } from './usage';

const HEALER_MODEL = 'openrouter/healer-alpha';

export interface VideoElement {
  element: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  timestamp?: string;
}

export interface VideoAnalysis {
  summary: string;
  elements: VideoElement[];
  contentStructure: {
    hook: string;
    body: string;
    cta: string;
  };
  scriptEstimate: string;
  duration: string;
  overallStyle: string;
}

/**
 * Analyze a video using Healer Alpha via OpenRouter (multimodal).
 * Accepts either a video URL or base64-encoded video data.
 */
export async function analyzeVideoWithGemini(config: {
  videoBase64?: string;
  videoMimeType?: string;
  videoUrl?: string;
  feature?: string;
}): Promise<VideoAnalysis> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured');

  const systemPrompt = `You are a video content analyst for a marketing agency. Analyze the provided video and extract a detailed breakdown of its elements.

For each element you identify, assign a priority level:
- "high" = critical to the video's success (e.g., script/dialogue, hook technique, core message)
- "medium" = important but not essential (e.g., pacing, background music choice, text overlays)
- "low" = nice-to-have detail (e.g., specific camera angle, color grading, prop placement)

Return a JSON object with this exact structure:
{
  "summary": "2-3 sentence overview of what the video is about and its style",
  "elements": [
    {
      "element": "Script/Dialogue",
      "description": "What is said, the tone, key phrases",
      "priority": "high",
      "timestamp": "0:00-0:05"
    }
  ],
  "contentStructure": {
    "hook": "How the video opens and grabs attention",
    "body": "Main content delivery approach",
    "cta": "How the video closes / call to action"
  },
  "scriptEstimate": "Rough transcript of what is spoken",
  "duration": "Estimated duration",
  "overallStyle": "Brief style description (e.g., talking head, fast-paced cuts, cinematic)"
}

Include elements for: Script/Dialogue, Hook technique, Camera angles, Visual cues (props, demonstrations), Text overlays, Pacing/energy, Background music/sound, Transitions, Lighting, Setting/location, Wardrobe/appearance, B-roll usage, CTA technique. Only include elements that are actually present. Sort by priority (high first).

Output ONLY valid JSON. No other text.`;

  // Build multimodal content parts for OpenRouter
  const contentParts: Record<string, unknown>[] = [];

  if (config.videoBase64 && config.videoMimeType) {
    contentParts.push({
      type: 'image_url',
      image_url: {
        url: `data:${config.videoMimeType};base64,${config.videoBase64}`,
      },
    });
  } else if (config.videoUrl) {
    contentParts.push({
      type: 'image_url',
      image_url: { url: config.videoUrl },
    });
  }

  contentParts.push({
    type: 'text',
    text: 'Analyze this video and return the JSON breakdown.',
  });

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      'X-Title': 'Nativz Cortex',
    },
    body: JSON.stringify({
      model: HEALER_MODEL,
      max_tokens: 4000,
      temperature: 0.3,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: contentParts },
      ],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    console.error('Healer Alpha API error:', response.status, errBody.substring(0, 500));
    throw new Error(`Healer Alpha API error (${response.status}): ${errBody.substring(0, 300)}`);
  }

  const data = await response.json();

  const text = data.choices?.[0]?.message?.content ?? '';
  if (!text) {
    throw new Error('Healer Alpha returned empty response');
  }

  // Log usage (free model, but track for visibility)
  const inputTokens = data.usage?.prompt_tokens ?? 0;
  const outputTokens = data.usage?.completion_tokens ?? 0;

  await logUsage({
    service: 'openrouter',
    model: HEALER_MODEL,
    feature: config.feature ?? 'video_analysis',
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    costUsd: 0, // Free model
  }).catch(() => {});

  // Parse JSON response (strip markdown fences if present)
  const cleaned = text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim();
  try {
    return JSON.parse(cleaned) as VideoAnalysis;
  } catch {
    console.error('Failed to parse Healer Alpha response:', cleaned.substring(0, 500));
    throw new Error('Failed to parse video analysis response');
  }
}
