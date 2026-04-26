import { resolveOpenAiApiKeyForFeature } from '@/lib/ai/provider-keys';

const DEFAULT_MODEL = 'gpt-image-1.5';
const DEFAULT_QUALITY = 'medium';
const TIMEOUT_MS = 180_000;
const MAX_RETRIES = 1;

export type OpenAiImageAspectRatio = '1:1' | '4:5' | '9:16' | '16:9' | '1.91:1';

export interface GenerateOpenAiAdImageParams {
  prompt: string;
  aspectRatio?: OpenAiImageAspectRatio | string;
  quality?: 'low' | 'medium' | 'high' | 'auto';
  feature?: string;
}

export interface GenerateOpenAiAdImageResult {
  image: Buffer;
  model: string;
  quality: string;
  size: string;
}

function imageModel(): string {
  return (process.env.CHATGPT_IMAGE_MODEL ?? process.env.OPENAI_IMAGE_MODEL ?? DEFAULT_MODEL).trim();
}

function sizeForAspectRatio(aspectRatio: string | undefined): string {
  switch (aspectRatio) {
    case '9:16':
    case '4:5':
      return '1024x1536';
    case '16:9':
    case '1.91:1':
      return '1536x1024';
    case '1:1':
    default:
      return '1024x1024';
  }
}

export async function generateOpenAiAdImage(
  params: GenerateOpenAiAdImageParams,
): Promise<GenerateOpenAiAdImageResult> {
  const apiKey = await resolveOpenAiApiKeyForFeature(params.feature ?? 'ad_image_generation');
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

  const model = imageModel();
  const quality = params.quality ?? (process.env.CHATGPT_IMAGE_QUALITY as 'low' | 'medium' | 'high' | 'auto' | undefined) ?? DEFAULT_QUALITY;
  const size = sizeForAspectRatio(params.aspectRatio);

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt: params.prompt,
          size,
          quality,
          output_format: 'png',
          n: 1,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`OpenAI image API ${res.status}: ${text.slice(0, 500)}`);
      }

      const data = (await res.json()) as {
        data?: Array<{ b64_json?: string; url?: string }>;
      };
      const first = data.data?.[0];
      if (first?.b64_json) {
        return { image: Buffer.from(first.b64_json, 'base64'), model, quality, size };
      }
      if (first?.url) {
        const imageRes = await fetch(first.url, { signal: AbortSignal.timeout(60_000) });
        if (!imageRes.ok) throw new Error(`OpenAI image URL fetch failed: ${imageRes.status}`);
        return {
          image: Buffer.from(await imageRes.arrayBuffer()),
          model,
          quality,
          size,
        };
      }
      throw new Error('OpenAI image API returned no image data');
    } catch (err) {
      clearTimeout(timeout);
      lastError = err instanceof Error ? err : new Error(String(err));
      if (
        lastError.message.includes('401') ||
        lastError.message.includes('400') ||
        lastError.message.includes('404')
      ) {
        break;
      }
    }
  }

  throw new Error(`OpenAI image generation failed: ${lastError?.message ?? 'unknown error'}`);
}
