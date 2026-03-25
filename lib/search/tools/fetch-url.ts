const DEFAULT_MAX_CHARS = 12_000;
const DEFAULT_TIMEOUT_MS = 12_000;

/**
 * Fetch URL and return plain text (HTML stripped loosely) for LLM context.
 */
export async function fetchUrlText(
  url: string,
  options: { maxChars?: number; timeoutMs?: number } = {},
): Promise<{ ok: boolean; text: string; status?: number }> {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'NativzCortexTopicSearch/1.0 (research)',
      },
    });
    clearTimeout(t);
    if (!res.ok) {
      return { ok: false, text: '', status: res.status };
    }
    const raw = await res.text();
    const text = stripHtmlLoosely(raw).slice(0, maxChars);
    return { ok: true, text, status: res.status };
  } catch {
    clearTimeout(t);
    return { ok: false, text: '' };
  }
}

function stripHtmlLoosely(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
