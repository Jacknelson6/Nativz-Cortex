import { createOpenRouterRichCompletion } from './openrouter-rich';
import { DEFAULT_OPENROUTER_MODEL } from './openrouter-default-model';

const HEALER_MODEL = DEFAULT_OPENROUTER_MODEL;

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

  const result = await createOpenRouterRichCompletion({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: contentParts },
    ],
    maxTokens: 4000,
    temperature: 0.3,
    feature: config.feature ?? 'video_analysis',
    modelPreference: [HEALER_MODEL],
  });

  const text = result.text;
  if (!text) {
    throw new Error('Healer Alpha returned empty response');
  }

  // Parse JSON response (strip markdown fences if present)
  const cleaned = text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim();
  try {
    return JSON.parse(cleaned) as VideoAnalysis;
  } catch {
    console.error('Failed to parse Healer Alpha response:', cleaned.substring(0, 500));
    throw new Error('Failed to parse video analysis response');
  }
}
