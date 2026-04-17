// ---------------------------------------------------------------------------
// Ad Creatives v2 — Gemini Scene Generation
// ---------------------------------------------------------------------------
//
// Simple REST call to Google AI Studio's image model (Nano Banana).
// Ported from morning-ads/scripts/src/weston/gemini-generate.ts. No image
// refs or brand overrides — v2 uses Gemini for scene generation only.

const DEFAULT_MODEL = "gemini-3.1-flash-image-preview";
const TIMEOUT_MS = 120_000;
const MAX_RETRIES = 2;

function endpoint(): string {
  const model = (process.env.GEMINI_IMAGE_MODEL ?? DEFAULT_MODEL).trim();
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

export async function generateGeminiImage(prompt: string): Promise<Buffer> {
  const apiKey = process.env.GOOGLE_AI_STUDIO_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_AI_STUDIO_KEY is not configured");
  }

  const url = `${endpoint()}?key=${apiKey}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Gemini API ${res.status}: ${text.slice(0, 300)}`);
      }

      const data = (await res.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{
              inlineData?: { data?: string };
              inline_data?: { data?: string };
            }>;
          };
        }>;
      };
      const parts = data.candidates?.[0]?.content?.parts ?? [];
      for (const p of parts) {
        const b64 = p.inlineData?.data ?? p.inline_data?.data;
        if (b64) return Buffer.from(b64, "base64");
      }
      throw new Error("No image in Gemini response");
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`[v2-gemini] attempt ${attempt + 1} failed:`, lastError.message);
      if (
        lastError.message.includes("API key") ||
        lastError.message.includes("400") ||
        lastError.message.includes("404")
      ) {
        break;
      }
    }
  }
  throw new Error(`Gemini generation failed: ${lastError?.message ?? "unknown"}`);
}
