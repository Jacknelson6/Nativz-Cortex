// ---------------------------------------------------------------------------
// Static Ad Generation — Image Generation via Google AI Studio
// ---------------------------------------------------------------------------
//
// Multimodal policy (Cortex static ads):
// - Always attach client product URL(s) and official logo URL(s) when the orchestrator supplies them.
//   Those define real merchandise and the real brand mark.
// - A layout template image (`referenceImageUrl`) is composition-only — do not copy its embedded logos
//   or product photos as the client's identity.
// - Supplementary brand refs (mood boards, site screenshots from DNA) are omitted when a layout
//   template is present so they do not fight template-driven composition; logo + product still apply.
//   Set `includeSupplementaryBrandReferencesWithLayoutTemplate` to force them on.

import {
  REFERENCE_IMAGE_MULTIMODAL_INSTRUCTION,
  REFERENCE_IMAGE_MULTIMODAL_INSTRUCTION_CLEAN_CANVAS,
  WIREFRAME_MULTIMODAL_INSTRUCTION_CLEAN_CANVAS,
} from './gemini-static-ad-prompt';

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
  /**
   * Local product shots as base64 (CLI / scripts). When non-empty, these are sent instead of
   * fetching `productImageUrls` for the product-reference slot (same multimodal instructions).
   */
  productImagesInline?: { mimeType: string; data: string }[];
  /** Extra brand images (mood boards, packaging, guideline shots) from client uploads */
  brandReferenceImageUrls?: string[];
  /**
   * Official logo asset URLs from Brand DNA — shown first among brand images with instructions
   * to reproduce the mark faithfully (Nano batches previously omitted these entirely).
   */
  brandLogoImageUrls?: string[];
  /**
   * When a layout template image is also sent, supplementary refs are skipped by default.
   * Set true only if you intentionally want mood/screenshot images alongside template copy.
   */
  includeSupplementaryBrandReferencesWithLayoutTemplate?: boolean;
  aspectRatio: string;
  /**
   * When true, multimodal hints match compositor / clean-canvas prompts (no typography or logo in-frame).
   * Caller should omit `brandLogoImageUrls` so logos are not duplicated vs compositor overlay.
   */
  cleanCanvas?: boolean;
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
  const cleanCanvas = params.cleanCanvas === true;
  const hasLayoutTemplateRef = Boolean(params.referenceImageUrl?.trim());
  let attachedProductRefCount = 0;
  let attachedLogoRefCount = 0;

  // 1. Include actual product images FIRST so the model uses real product photography
  const inlineProducts = params.productImagesInline?.filter((p) => p.data?.length) ?? [];
  if (inlineProducts.length > 0) {
    const valid = inlineProducts.slice(0, 3);
    attachedProductRefCount = valid.length;
    for (const img of valid) {
      parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
    }
    parts.push({
      text:
        `The above ${valid.length > 1 ? 'images are ACTUAL product photos' : 'image is an ACTUAL product photo'} for this brand. You MUST use these exact products in the advertisement — do not generate different or imaginary product imagery. The product appearance, packaging, and colors must match these reference photos exactly.\n` +
        `PHOTOREAL FIDELITY: Keep the same SKU/variant, printed graphics, text and seals on the product, serial or label zones, and overall silhouette as the reference. You may adjust lighting, shadow, depth, and a modest camera angle as if reshooting in studio — do NOT invent a different design, denomination, or packaging, merge two references into one hybrid, or repaint artwork on the product surface.\n\n`,
    });
  } else {
    const productImages = params.productImageUrls ?? [];
    if (productImages.length > 0) {
      const fetched = await Promise.all(productImages.slice(0, 3).map(fetchImageAsBase64));
      const valid = fetched.filter(Boolean) as { mimeType: string; data: string }[];
      attachedProductRefCount = valid.length;
      if (valid.length > 0) {
        for (const img of valid) {
          parts.push({ inlineData: img });
        }
        parts.push({
          text:
            `The above ${valid.length > 1 ? 'images are ACTUAL product photos' : 'image is an ACTUAL product photo'} for this brand. You MUST use these exact products in the advertisement — do not generate different or imaginary product imagery. The product appearance, packaging, and colors must match these reference photos exactly.\n` +
            `PHOTOREAL FIDELITY: Keep the same SKU/variant, printed graphics, text and seals on the product, serial or label zones, and overall silhouette as the reference. You may adjust lighting, shadow, depth, and a modest camera angle as if reshooting in studio — do NOT invent a different design, denomination, or packaging, merge two references into one hybrid, or repaint artwork on the product surface.\n\n`,
        });
      }
    }
  }

  // 2a. Official brand logo(s) from guidelines (before generic mood refs)
  const logoUrls = params.brandLogoImageUrls ?? [];
  if (logoUrls.length > 0) {
    const fetched = await Promise.all(logoUrls.slice(0, 2).map(fetchImageAsBase64));
    const valid = fetched.filter(Boolean) as { mimeType: string; data: string }[];
    attachedLogoRefCount = valid.length;
    if (valid.length > 0) {
      for (const img of valid) {
        parts.push({ inlineData: img });
      }
      parts.push({
        text:
          `The above ${valid.length > 1 ? 'images are the official BRAND LOGOS' : 'image is the official BRAND LOGO'} from the brand guidelines. ` +
          `Place a faithful rendition of this mark on the finished ad (correct proportions, lockup, and colors as shown). ` +
          `Do not invent a different logo, wordmark, or substitute another company’s identity.\n\n`,
      });
    }
  }

  if (
    hasLayoutTemplateRef &&
    (attachedProductRefCount > 0 || attachedLogoRefCount > 0)
  ) {
    parts.push({
      text:
        'A layout template image will appear later in this request — use it ONLY for rough composition and spacing. ' +
        'The product and/or logo reference images above are the authoritative visuals for merchandise and brand mark. ' +
        'Do not copy any product, logo, or packshot shown inside the template image as if it were this client’s.\n\n',
    });
  }

  // 2b. Supplementary brand references — skipped when copying a layout template (avoids conflicting mood priors)
  const skipSupplementary =
    hasLayoutTemplateRef && !params.includeSupplementaryBrandReferencesWithLayoutTemplate;
  const brandRefs = skipSupplementary ? [] : (params.brandReferenceImageUrls ?? []);
  if (brandRefs.length > 0) {
    const fetched = await Promise.all(brandRefs.slice(0, 5).map(fetchImageAsBase64));
    const valid = fetched.filter(Boolean) as { mimeType: string; data: string }[];
    if (valid.length > 0) {
      for (const img of valid) {
        parts.push({ inlineData: img });
      }
      parts.push({
        text: `The above ${valid.length > 1 ? 'images are supplementary brand references' : 'image is a supplementary brand reference'} (mood boards, packaging, site captures, or extra guideline art). Use them for color mood, photography style, and on-brand visual language. Do not copy unrelated text, third-party marks, or replace the official logo given earlier.\n\n`,
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
      text: cleanCanvas
        ? WIREFRAME_MULTIMODAL_INSTRUCTION_CLEAN_CANVAS
        : 'The above image is a grayscale WIREFRAME — tinted rectangles only, no letters. It approximates zones for headline block, hero visual, and CTA area. Use it as loose spatial guidance for composition and negative space; do NOT trace visible boxes as hard UI chrome. Render the complete ad per the final text prompt (typography, hero, CTA, single brand mark) — the wireframe is spatial hint only.\n\n',
    });
  }

  // 4. Template style reference (layout/composition guide only) — only when caller opts in
  if (params.referenceImageUrl) {
    const ref = await fetchImageAsBase64(params.referenceImageUrl);
    if (ref) {
      parts.push({ inlineData: ref });
      parts.push({
        text: cleanCanvas ? REFERENCE_IMAGE_MULTIMODAL_INSTRUCTION_CLEAN_CANVAS : REFERENCE_IMAGE_MULTIMODAL_INSTRUCTION,
      });
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
