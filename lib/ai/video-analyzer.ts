import { calculateCost, logUsage } from './usage';
import { resolveDashscopeApiKeyForFeature } from './provider-keys';

const DASHSCOPE_BASE_URL = 'https://dashscope-us.aliyuncs.com/compatible-mode/v1';
const VIDEO_ANALYSIS_MODEL = 'qwen3.5-omni-flash';

export interface VideoAnalysis {
  visualHooks: string[];
  onScreenText: string[];
  sceneDescription: string;
  productionQuality: string;
  contentType: 'UGC' | 'professional' | 'screen-record' | 'animation' | 'mixed' | string;
  keyVisualElements: string[];
}

export async function analyzeVideoWithVision(
  videoUrl: string,
  thumbnailUrl: string,
  transcript?: string,
): Promise<VideoAnalysis> {
  const apiKey = resolveDashscopeApiKeyForFeature('video_analysis');
  if (!apiKey) throw new Error('Dashscope API key not configured (add DASHSCOPE_API_KEY)');

  // Fetch thumbnail and convert to base64
  const thumbResponse = await fetch(thumbnailUrl);
  if (!thumbResponse.ok) {
    throw new Error(`Failed to fetch thumbnail: ${thumbResponse.status}`);
  }
  const thumbBuffer = await thumbResponse.arrayBuffer();
  const thumbBase64 = Buffer.from(thumbBuffer).toString('base64');
  const contentType = thumbResponse.headers.get('content-type') || 'image/jpeg';
  const dataUrl = `data:${contentType};base64,${thumbBase64}`;

  const transcriptSection = transcript
    ? `\n\nTranscript (if helpful):\n${transcript.slice(0, 2000)}`
    : '';

  const prompt = `You are a video content analyst. Analyze this video thumbnail and provide a structured assessment.

Video URL (for context): ${videoUrl}${transcriptSection}

Return a JSON object with exactly these fields:
{
  "visualHooks": ["array of 2-5 attention-grabbing visual elements that would stop a viewer scrolling"],
  "onScreenText": ["array of any text visible in the thumbnail or likely appearing early in the video"],
  "sceneDescription": "one paragraph describing the setting, subjects, and overall visual composition",
  "productionQuality": "brief assessment: lighting, camera quality, editing style, production value tier",
  "contentType": "one of: UGC, professional, screen-record, animation, mixed",
  "keyVisualElements": ["array of 3-7 notable visual elements: props, colors, expressions, backgrounds, etc."]
}

Respond with only valid JSON, no markdown fences.`;

  const body = {
    model: VIDEO_ANALYSIS_MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: dataUrl },
          },
          {
            type: 'text',
            text: prompt,
          },
        ],
      },
    ],
  };

  const response = await fetch(`${DASHSCOPE_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Dashscope video analysis error (${response.status}): ${errorBody.substring(0, 300)}`);
  }

  const data = await response.json() as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Video analysis returned empty response');

  const usage = data.usage;
  const promptTokens = usage?.prompt_tokens ?? 0;
  const completionTokens = usage?.completion_tokens ?? 0;
  const modelKey = `dashscope/${VIDEO_ANALYSIS_MODEL}`;
  const estimatedCost = calculateCost(modelKey, promptTokens, completionTokens);

  logUsage({
    service: 'dashscope',
    model: modelKey,
    feature: 'video_analysis',
    inputTokens: promptTokens,
    outputTokens: completionTokens,
    totalTokens: promptTokens + completionTokens,
    costUsd: estimatedCost,
  }).catch(() => {});

  let parsed: VideoAnalysis;
  try {
    parsed = JSON.parse(content) as VideoAnalysis;
  } catch {
    throw new Error(`Video analysis returned invalid JSON: ${content.substring(0, 200)}`);
  }

  return {
    visualHooks: parsed.visualHooks ?? [],
    onScreenText: parsed.onScreenText ?? [],
    sceneDescription: parsed.sceneDescription ?? '',
    productionQuality: parsed.productionQuality ?? '',
    contentType: parsed.contentType ?? 'UGC',
    keyVisualElements: parsed.keyVisualElements ?? [],
  };
}
