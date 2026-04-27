// Gemini File API — resumable upload + ACTIVE polling.
// https://ai.google.dev/gemini-api/docs/files

const BASE = 'https://generativelanguage.googleapis.com';

function getApiKey(): string {
  const key = process.env.GOOGLE_AI_STUDIO_KEY;
  if (!key) throw new Error('GOOGLE_AI_STUDIO_KEY not configured');
  return key;
}

export interface GeminiFileRef {
  name: string;
  uri: string;
  mimeType: string;
}

export async function uploadFileToGemini(opts: {
  buffer: Buffer;
  mimeType: string;
  displayName: string;
}): Promise<GeminiFileRef> {
  const apiKey = getApiKey();

  const startRes = await fetch(`${BASE}/upload/v1beta/files?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(opts.buffer.length),
      'X-Goog-Upload-Header-Content-Type': opts.mimeType,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: opts.displayName } }),
  });
  if (!startRes.ok) {
    const text = await startRes.text().catch(() => '');
    throw new Error(`Gemini upload start failed: ${startRes.status} ${text.slice(0, 200)}`);
  }
  const uploadUrl = startRes.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('Gemini upload URL not returned');

  const finalizeRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(opts.buffer.length),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: new Uint8Array(opts.buffer),
  });
  if (!finalizeRes.ok) {
    const text = await finalizeRes.text().catch(() => '');
    throw new Error(`Gemini upload finalize failed: ${finalizeRes.status} ${text.slice(0, 200)}`);
  }
  const data = (await finalizeRes.json()) as {
    file?: { name: string; uri: string; mimeType: string; state?: string };
  };
  if (!data.file?.uri || !data.file?.name) throw new Error('Gemini upload returned no file ref');

  return {
    name: data.file.name,
    uri: data.file.uri,
    mimeType: data.file.mimeType,
  };
}

export async function waitForGeminiFileActive(
  fileName: string,
  opts: { timeoutMs?: number; pollMs?: number } = {},
): Promise<void> {
  const apiKey = getApiKey();
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const pollMs = opts.pollMs ?? 2_000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const res = await fetch(`${BASE}/v1beta/${fileName}?key=${apiKey}`);
    if (res.ok) {
      const data = (await res.json()) as { state?: string };
      if (data.state === 'ACTIVE') return;
      if (data.state === 'FAILED') throw new Error('Gemini file processing failed');
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error('Timed out waiting for Gemini file to become ACTIVE');
}

interface GeminiGenerateOpts {
  fileUri: string;
  mimeType: string;
  prompt: string;
  responseSchema?: object;
  model?: string;
}

export async function generateWithFile<T>(opts: GeminiGenerateOpts): Promise<T> {
  const apiKey = getApiKey();
  const model = opts.model ?? 'gemini-2.5-flash';
  const url = `${BASE}/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const generationConfig: Record<string, unknown> = {
    temperature: 0.4,
    maxOutputTokens: 2048,
  };
  if (opts.responseSchema) {
    generationConfig.response_mime_type = 'application/json';
    generationConfig.response_schema = opts.responseSchema;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { fileData: { fileUri: opts.fileUri, mimeType: opts.mimeType } },
            { text: opts.prompt },
          ],
        },
      ],
      generationConfig,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gemini generateContent failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text) throw new Error('Gemini returned empty response');

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Gemini response was not valid JSON: ${text.slice(0, 200)}`);
  }
}
