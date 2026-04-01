/**
 * Shared HTTP POST for TrustGraph gateway (cortex-shaped or native API).
 */

export async function postTrustGraphJson(
  baseUrl: string,
  path: string,
  apiKey: string | null,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<unknown> {
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`TrustGraph HTTP ${res.status}: ${text.slice(0, 500)}`);
    }
    if (!text) return null;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error('TrustGraph response is not JSON');
    }
  } finally {
    clearTimeout(t);
  }
}
