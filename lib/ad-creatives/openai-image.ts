import { resolveOpenAiApiKeyForFeature } from '@/lib/ai/provider-keys';

const DEFAULT_MODEL = 'gpt-image-2';
const DEFAULT_QUALITY: ImageQuality = 'medium';
const TIMEOUT_MS = 180_000;
const MAX_RETRIES = 1;

export type OpenAiImageAspectRatio = '1:1' | '4:5' | '9:16' | '16:9' | '1.91:1';
export type ImageQuality = 'low' | 'medium' | 'high' | 'auto';

/**
 * Stable error codes the UI can switch on. Keep these strings in sync with
 * the chat component's error mapper so a missing key always reads "set your
 * OpenAI key" no matter which surface (batch generate, single render, future
 * cron) hit the wall.
 */
export type OpenAiImageErrorCode =
  | 'KEY_MISSING'
  | 'AUTH_FAILED'
  | 'QUOTA_EXHAUSTED'
  | 'RATE_LIMITED'
  | 'BAD_REQUEST'
  | 'CONTENT_BLOCKED'
  | 'TIMEOUT'
  | 'IMAGE_API_FAILED';

export class OpenAiImageError extends Error {
  readonly code: OpenAiImageErrorCode;
  readonly httpStatus: number | null;
  readonly providerMessage: string | null;

  constructor(
    code: OpenAiImageErrorCode,
    message: string,
    opts: { httpStatus?: number | null; providerMessage?: string | null } = {},
  ) {
    super(message);
    this.name = 'OpenAiImageError';
    this.code = code;
    this.httpStatus = opts.httpStatus ?? null;
    this.providerMessage = opts.providerMessage ?? null;
  }
}

export interface GenerateOpenAiAdImageParams {
  prompt: string;
  aspectRatio?: OpenAiImageAspectRatio | string;
  quality?: ImageQuality;
  feature?: string;
}

export interface GenerateOpenAiAdImageResult {
  image: Buffer;
  model: string;
  quality: ImageQuality;
  size: string;
  /** Token counts when the API surfaces them (gpt-image-2 returns these). */
  inputTokens: number;
  outputTokens: number;
  /** Estimated USD cost from our static price table. */
  estimatedCostUsd: number;
}

function imageModel(): string {
  return (process.env.CHATGPT_IMAGE_MODEL ?? process.env.OPENAI_IMAGE_MODEL ?? DEFAULT_MODEL).trim();
}

function imageQuality(override: ImageQuality | undefined): ImageQuality {
  if (override) return override;
  const env = process.env.CHATGPT_IMAGE_QUALITY?.trim();
  if (env === 'low' || env === 'medium' || env === 'high' || env === 'auto') return env;
  return DEFAULT_QUALITY;
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

/**
 * Per-image USD price (gpt-image-2). 1024×1024 numbers come from the
 * published pricing page; non-square sizes are extrapolated by pixel area
 * (≈1.5×) until OpenAI publishes per-pixel pricing. `auto` is treated as
 * `medium` for cost reporting — the actual quality charged will reconcile
 * via the response's `output_tokens` once we add reconciliation.
 */
const IMAGE_PRICE_USD: Record<string, Record<string, number>> = {
  'gpt-image-2': {
    'low|1024x1024': 0.006,
    'medium|1024x1024': 0.053,
    'high|1024x1024': 0.211,
    'low|1024x1536': 0.009,
    'medium|1024x1536': 0.080,
    'high|1024x1536': 0.317,
    'low|1536x1024': 0.009,
    'medium|1536x1024': 0.080,
    'high|1536x1024': 0.317,
  },
};

export function estimateImageCostUsd(model: string, quality: ImageQuality, size: string): number {
  const table = IMAGE_PRICE_USD[model] ?? IMAGE_PRICE_USD['gpt-image-2'];
  const q = quality === 'auto' ? 'medium' : quality;
  return table[`${q}|${size}`] ?? 0;
}

export async function generateOpenAiAdImage(
  params: GenerateOpenAiAdImageParams,
): Promise<GenerateOpenAiAdImageResult> {
  const apiKey = await resolveOpenAiApiKeyForFeature(params.feature ?? 'ad_image_generation');
  if (!apiKey) {
    throw new OpenAiImageError(
      'KEY_MISSING',
      'OpenAI API key is not configured. Add a key in Cortex settings → AI credentials.',
    );
  }

  const model = imageModel();
  const quality = imageQuality(params.quality);
  const size = sizeForAspectRatio(params.aspectRatio);

  let lastError: OpenAiImageError | null = null;
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
        const errBody = await res.text().catch(() => '');
        throw classifyHttpError(res.status, errBody);
      }

      const data = (await res.json()) as {
        data?: Array<{ b64_json?: string; url?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      const first = data.data?.[0];
      let imageBuffer: Buffer | null = null;
      if (first?.b64_json) {
        imageBuffer = Buffer.from(first.b64_json, 'base64');
      } else if (first?.url) {
        const imageRes = await fetch(first.url, { signal: AbortSignal.timeout(60_000) });
        if (!imageRes.ok) {
          throw new OpenAiImageError(
            'IMAGE_API_FAILED',
            `OpenAI returned an image URL but it failed to fetch (${imageRes.status}).`,
            { httpStatus: imageRes.status },
          );
        }
        imageBuffer = Buffer.from(await imageRes.arrayBuffer());
      }
      if (!imageBuffer) {
        throw new OpenAiImageError(
          'IMAGE_API_FAILED',
          'OpenAI image API returned no image data.',
        );
      }

      const inputTokens = Number(data.usage?.input_tokens ?? 0);
      const outputTokens = Number(data.usage?.output_tokens ?? 0);
      const estimatedCostUsd = estimateImageCostUsd(model, quality, size);

      return {
        image: imageBuffer,
        model,
        quality,
        size,
        inputTokens,
        outputTokens,
        estimatedCostUsd,
      };
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof OpenAiImageError) {
        lastError = err;
        if (isTerminalCode(err.code)) break;
        continue;
      }
      const isAbort = err instanceof Error && err.name === 'AbortError';
      lastError = new OpenAiImageError(
        isAbort ? 'TIMEOUT' : 'IMAGE_API_FAILED',
        isAbort ? 'OpenAI image generation timed out.' : `OpenAI image generation failed: ${describe(err)}`,
      );
      if (isTerminalCode(lastError.code)) break;
    }
  }

  throw lastError ?? new OpenAiImageError('IMAGE_API_FAILED', 'OpenAI image generation failed.');
}

function isTerminalCode(code: OpenAiImageErrorCode): boolean {
  return (
    code === 'KEY_MISSING' ||
    code === 'AUTH_FAILED' ||
    code === 'QUOTA_EXHAUSTED' ||
    code === 'BAD_REQUEST' ||
    code === 'CONTENT_BLOCKED'
  );
}

/**
 * Map an HTTP error from the Images API to a typed code. We sniff the JSON
 * body's `error.code` first (OpenAI's machine-readable string), then fall
 * back to status-based heuristics so we still classify correctly when
 * upstream returns a bare 5xx.
 */
function classifyHttpError(status: number, rawBody: string): OpenAiImageError {
  const parsed = parseJson(rawBody);
  const apiCode = parsed?.error?.code ?? null;
  const apiMsg = parsed?.error?.message ?? rawBody.slice(0, 500);

  if (apiCode === 'insufficient_quota' || status === 402) {
    return new OpenAiImageError(
      'QUOTA_EXHAUSTED',
      'OpenAI account has no credits remaining. Add billing at platform.openai.com/billing.',
      { httpStatus: status, providerMessage: apiMsg },
    );
  }
  if (apiCode === 'rate_limit_exceeded' || apiCode === 'rate_limit' || status === 429) {
    return new OpenAiImageError(
      'RATE_LIMITED',
      'OpenAI is rate-limiting image requests. Wait a moment and try again.',
      { httpStatus: status, providerMessage: apiMsg },
    );
  }
  if (apiCode === 'content_policy_violation' || apiCode === 'moderation_blocked') {
    return new OpenAiImageError(
      'CONTENT_BLOCKED',
      'OpenAI blocked the image prompt for content policy. Soften the prompt and retry.',
      { httpStatus: status, providerMessage: apiMsg },
    );
  }
  if (status === 401 || status === 403) {
    return new OpenAiImageError(
      'AUTH_FAILED',
      'OpenAI rejected the API key. Check the key in Cortex settings → AI credentials.',
      { httpStatus: status, providerMessage: apiMsg },
    );
  }
  if (status === 400 || status === 404) {
    return new OpenAiImageError(
      'BAD_REQUEST',
      `OpenAI rejected the request: ${apiMsg}`,
      { httpStatus: status, providerMessage: apiMsg },
    );
  }
  return new OpenAiImageError(
    'IMAGE_API_FAILED',
    `OpenAI image API ${status}: ${apiMsg}`,
    { httpStatus: status, providerMessage: apiMsg },
  );
}

function parseJson(raw: string): { error?: { code?: string; message?: string } } | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { error?: { code?: string; message?: string } };
  } catch {
    return null;
  }
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
