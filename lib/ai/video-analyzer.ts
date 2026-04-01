import { calculateCost, logUsage } from './usage';
import { resolveDashscopeApiKeyForFeature } from './provider-keys';

const DASHSCOPE_BASE_URL = 'https://dashscope-us.aliyuncs.com/compatible-mode/v1';
const VIDEO_ANALYSIS_MODEL = 'qwen3.5-omni-flash';

/** ReClip local video downloader (yt-dlp backend) */
const RECLIP_BASE_URL = process.env.RECLIP_URL || 'http://localhost:8899';

/**
 * Download a video via ReClip (local yt-dlp service).
 * Returns the download URL for the mp4 file, or null on failure.
 */
export async function downloadVideoViaReclip(videoUrl: string): Promise<string | null> {
  try {
    // Start download
    const dlResp = await fetch(`${RECLIP_BASE_URL}/api/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: videoUrl, format: 'mp4' }),
      signal: AbortSignal.timeout(10000),
    });
    if (!dlResp.ok) return null;
    const { job_id } = await dlResp.json() as { job_id: string };
    if (!job_id) return null;

    // Poll for completion (max 60s)
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const statusResp = await fetch(`${RECLIP_BASE_URL}/api/status/${job_id}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!statusResp.ok) continue;
      const status = await statusResp.json() as { status: string; filename?: string };
      if (status.status === 'done' && status.filename) {
        return `${RECLIP_BASE_URL}/api/file/${job_id}`;
      }
      if (status.status === 'error') return null;
    }
    return null;
  } catch {
    return null;
  }
}

export interface VideoAnalysis {
  visualHooks: string[];
  onScreenText: string[];
  sceneDescription: string;
  productionQuality: string;
  contentType: 'UGC' | 'professional' | 'screen-record' | 'animation' | 'mixed' | string;
  keyVisualElements: string[];
  /** Audio analysis fields (populated when audio/video file is available) */
  audioMood?: string;
  musicPresent?: boolean;
  musicDescription?: string;
  voiceoverPresent?: boolean;
  voiceoverTone?: string;
  soundEffects?: string[];
  audioHooks?: string[];
}

/**
 * Analyze a video using Qwen3.5 Omni Flash.
 * If a direct video/audio file URL is provided, Omni will analyze both visual and audio.
 * Otherwise falls back to thumbnail-only visual analysis.
 */
export async function analyzeVideoWithVision(
  videoUrl: string,
  thumbnailUrl: string,
  transcript?: string,
  /** Direct mp4/audio URL for audio analysis (e.g. TikTok videoUrl from tikwm) */
  directVideoUrl?: string | null,
): Promise<VideoAnalysis> {
  const apiKey = resolveDashscopeApiKeyForFeature('video_analysis');
  if (!apiKey) throw new Error('Dashscope API key not configured (add DASHSCOPE_API_KEY)');

  // If no direct video URL provided, try downloading via ReClip
  if (!directVideoUrl && videoUrl) {
    const reclipUrl = await downloadVideoViaReclip(videoUrl);
    if (reclipUrl) directVideoUrl = reclipUrl;
  }

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

  // Try to fetch audio/video for Omni audio analysis
  let audioBase64: string | null = null;
  let audioMimeType = 'audio/mp4';
  if (directVideoUrl) {
    try {
      const audioResp = await fetch(directVideoUrl, { signal: AbortSignal.timeout(15000) });
      if (audioResp.ok) {
        const audioBuffer = await audioResp.arrayBuffer();
        // Only process if under 10MB to avoid memory issues
        if (audioBuffer.byteLength < 10 * 1024 * 1024) {
          audioBase64 = Buffer.from(audioBuffer).toString('base64');
          const ct = audioResp.headers.get('content-type');
          if (ct) audioMimeType = ct;
        }
      }
    } catch {
      // Audio fetch failed — continue with visual-only analysis
    }
  }

  const audioFields = audioBase64
    ? `,
  "audioMood": "overall mood/energy of the audio (e.g. upbeat, calm, intense, comedic)",
  "musicPresent": true/false,
  "musicDescription": "genre, tempo, and feel of any background music",
  "voiceoverPresent": true/false,
  "voiceoverTone": "tone and style of any speaking voice (e.g. conversational, authoritative, excited)",
  "soundEffects": ["notable sound effects or audio transitions"],
  "audioHooks": ["audio elements in the first 3 seconds that grab attention"]`
    : '';

  const prompt = `You are a video content analyst. Analyze this video${audioBase64 ? ' (visual AND audio)' : ' thumbnail'} and provide a structured assessment.

Video URL (for context): ${videoUrl}${transcriptSection}

Return a JSON object with exactly these fields:
{
  "visualHooks": ["array of 2-5 attention-grabbing visual elements that would stop a viewer scrolling"],
  "onScreenText": ["array of any text visible in the thumbnail or likely appearing early in the video"],
  "sceneDescription": "one paragraph describing the setting, subjects, and overall visual composition",
  "productionQuality": "brief assessment: lighting, camera quality, editing style, production value tier",
  "contentType": "one of: UGC, professional, screen-record, animation, mixed",
  "keyVisualElements": ["array of 3-7 notable visual elements: props, colors, expressions, backgrounds, etc."]${audioFields}
}

Respond with only valid JSON, no markdown fences.`;

  // Build multimodal content array
  const contentParts: Array<Record<string, unknown>> = [
    {
      type: 'image_url',
      image_url: { url: dataUrl },
    },
  ];

  // Add audio/video if available
  if (audioBase64) {
    contentParts.push({
      type: 'input_audio',
      input_audio: {
        data: audioBase64,
        format: audioMimeType.includes('mp4') ? 'mp4' : 'wav',
      },
    });
  }

  contentParts.push({
    type: 'text',
    text: prompt,
  });

  const body = {
    model: VIDEO_ANALYSIS_MODEL,
    max_tokens: 1536,
    messages: [
      {
        role: 'user',
        content: contentParts,
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
    audioMood: parsed.audioMood,
    musicPresent: parsed.musicPresent,
    musicDescription: parsed.musicDescription,
    voiceoverPresent: parsed.voiceoverPresent,
    voiceoverTone: parsed.voiceoverTone,
    soundEffects: parsed.soundEffects ?? [],
    audioHooks: parsed.audioHooks ?? [],
  };
}
