// ---------------------------------------------------------------------------
// Static Ad Generation — Image Generation via Google AI Studio
// ---------------------------------------------------------------------------

const GOOGLE_AI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent';

const MAX_RETRIES = 2;
const TIMEOUT_MS = 90_000;

interface GenerateAdImageParams {
  prompt: string;
  referenceImageUrl?: string;
  productImageUrls?: string[];
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

  // 2. Template style reference (layout/composition guide only)
  if (params.referenceImageUrl) {
    const ref = await fetchImageAsBase64(params.referenceImageUrl);
    if (ref) {
      parts.push({ inlineData: ref });
      parts.push({
        text: 'The above image is a STYLE and LAYOUT reference only. Copy the visual layout, text positioning, composition structure, and design style — but replace all content with the brand-specific content described below. Do NOT copy any brand names, logos, or product images from this reference.\n\n',
      });
    }
  }

  parts.push({ text: params.prompt });

  return parts;
}

async function callGeminiImageGeneration(
  apiKey: string,
  parts: GeminiContentPart[],
): Promise<Buffer> {
  const url = `${GOOGLE_AI_ENDPOINT}?key=${apiKey}`;

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
  const imagePart = responseParts.find(
    (p: { inlineData?: { data: string; mimeType: string } }) => p.inlineData?.data,
  );

  if (!imagePart?.inlineData?.data) {
    // Check if there's a text-only response (e.g. safety block)
    const textPart = responseParts.find((p: { text?: string }) => p.text);
    const reason = textPart?.text ?? 'no image data in response';
    throw new Error(`Gemini did not return an image: ${reason}`);
  }

  return Buffer.from(imagePart.inlineData.data, 'base64');
}
