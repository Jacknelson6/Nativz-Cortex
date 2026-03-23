// ---------------------------------------------------------------------------
// Static Ad Generation — Image Generation via Google AI Studio
// ---------------------------------------------------------------------------

import { REFERENCE_IMAGE_MULTIMODAL_INSTRUCTION } from './gemini-static-ad-prompt';

/** Image-capable Gemini model (Google AI Studio). Override with GEMINI_IMAGE_MODEL if needed. */
const DEFAULT_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';

function imageGenerationEndpoint(): string {
  const model = (process.env.GEMINI_IMAGE_MODEL ?? DEFAULT_IMAGE_MODEL).trim();
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

const MAX_RETRIES = 2;
const TIMEOUT_MS = 90_000;

interface GenerateAdImageParams {
  prompt: string;
  referenceImageUrl?: string;
  /** Grayscale zone map from `buildLayoutWireframePng` — spatial hint only */
  layoutWireframePng?: Buffer;
  productImageUrls?: string[];
  /** Extra brand images (mood boards, packaging, guideline shots) from client uploads */
  brandReferenceImageUrls?: string[];
  aspectRatio: string;
}

interface GeminiContentPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

/**
 * Generate a static ad image using Gemini 2.0 Flash image generation.
 * Returns a Buffer containing the PNG image data.
 */
export async function generateAdImage(params: GenerateAdImageParams): Promise<Buffer> {
  const apiKey = process.env.GOOGLE_AI_STUDIO_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_AI_STUDIO_KEY is not configured');
  }

  const parts = await buildParts(params);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const buffer = await callGeminiImageGeneration(apiKey, parts);
      return buffer;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(
        `[generate-image] attempt ${attempt + 1}/${MAX_RETRIES + 1} failed:`,
        lastError.message,
      );
      // Don't retry on non-retryable errors
      if (lastError.message.includes('API key') || lastError.message.includes('400') || lastError.message.includes('404')) {
        break;
      }
    }
  }

  throw new Error(
    `Image generation failed after ${MAX_RETRIES + 1} attempts: ${lastError?.message ?? 'unknown error'}`,
  );
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function fetchImageAsBase64(url: string): Promise<{ mimeType: string; data: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    const data = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = res.headers.get('content-type') ?? 'image/png';
    return { mimeType, data };
  } catch {
    return null;
  }
}

async function buildParts(params: GenerateAdImageParams): Promise<GeminiContentPart[]> {
  const parts: GeminiContentPart[] = [];

  // 1. Include actual product images FIRST so the model uses real product photography
  const productImages = params.productImageUrls ?? [];
  if (productImages.length > 0) {
    const fetched = await Promise.all(productImages.slice(0, 3).map(fetchImageAsBase64));
    const valid = fetched.filter(Boolean) as { mimeType: string; data: string }[];
    if (valid.length > 0) {
      for (const img of valid) {
        parts.push({ inlineData: img });
      }
      parts.push({
        text: `The above ${valid.length > 1 ? 'images are ACTUAL product photos' : 'image is an ACTUAL product photo'} for this brand. You MUST use these exact products in the advertisement — do not generate different or imaginary product imagery. The product appearance, packaging, and colors must match these reference photos exactly.\n\n`,
      });
    }
  }

  // 2. Uploaded brand reference images (after product shots, before layout template)
  const brandRefs = params.brandReferenceImageUrls ?? [];
  if (brandRefs.length > 0) {
    const fetched = await Promise.all(brandRefs.slice(0, 5).map(fetchImageAsBase64));
    const valid = fetched.filter(Boolean) as { mimeType: string; data: string }[];
    if (valid.length > 0) {
      for (const img of valid) {
        parts.push({ inlineData: img });
      }
      parts.push({
        text: `The above ${valid.length > 1 ? 'images are supplementary brand references' : 'image is a supplementary brand reference'} (mood, packaging, photography style, or guideline examples). Use them for color mood, composition, and on-brand visual language — not for copying any text or third-party logos from those images.\n\n`,
      });
    }
  }

  // 3. Generated wireframe (zone map — no text)
  if (params.layoutWireframePng && params.layoutWireframePng.length > 0) {
    parts.push({
      inlineData: {
        mimeType: 'image/png',
        data: params.layoutWireframePng.toString('base64'),
      },
    });
    parts.push({
      text:
        'The above image is a grayscale WIREFRAME — tinted rectangles only, no letters. It approximates zones for headline block, hero visual, and CTA area. Use it as loose spatial guidance for composition and negative space; do NOT trace visible boxes as hard UI chrome. Render the complete ad per the final text prompt (typography, hero, CTA, single brand mark) — the wireframe is spatial hint only.\n\n',
    });
  }

  // 4. Template style reference (layout/composition guide only) — only when caller opts in
  if (params.referenceImageUrl) {
    const ref = await fetchImageAsBase64(params.referenceImageUrl);
    if (ref) {
      parts.push({ inlineData: ref });
      parts.push({ text: REFERENCE_IMAGE_MULTIMODAL_INSTRUCTION });
    }
  }

  // 5. Text prompt last
  parts.push({ text: params.prompt });

  return parts;
}

async function callGeminiImageGeneration(
  apiKey: string,
  parts: GeminiContentPart[],
): Promise<Buffer> {
  const url = `${imageGenerationEndpoint()}?key=${apiKey}`;

  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
    },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Image generation timed out after ${TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '(unable to read body)');
    throw new Error(
      `Gemini image generation API error (${response.status}): ${errorBody.substring(0, 500)}`,
    );
  }

  const data = await response.json();

  // Extract the base64 image from Gemini response
  // Response structure: { candidates: [{ content: { parts: [{ inlineData: { data, mimeType } }, ...] } }] }
  const candidates = data.candidates ?? [];
  if (candidates.length === 0) {
    throw new Error('Gemini returned no candidates');
  }

  const responseParts = candidates[0]?.content?.parts ?? [];

  function inlineImageB64(p: Record<string, unknown>): string | undefined {
    const camel = p.inlineData as { data?: string } | undefined;
    if (camel?.data) return camel.data;
    const snake = p.inline_data as { data?: string } | undefined;
    return snake?.data;
  }

  const imagePart = responseParts.find((p: Record<string, unknown>) => inlineImageB64(p));
  const b64 = imagePart ? inlineImageB64(imagePart as Record<string, unknown>) : undefined;

  if (!b64) {
    const textPart = responseParts.find((p: { text?: string }) => p.text);
    const reason = textPart?.text ?? 'no image data in response';
    throw new Error(`Gemini did not return an image: ${reason}`);
  }

  return Buffer.from(b64, 'base64');
}
