import { normalizeUrlForMatch } from '@/lib/search/tools/urls';

export type WebCitationHit = {
  url: string;
  title: string;
  snippet: string;
};

/**
 * OpenRouter web search / :online models may attach `annotations` with `url_citation`
 * on the assistant message (OpenAI-compatible schema).
 */
export function extractOpenRouterWebCitations(data: Record<string, unknown>): WebCitationHit[] {
  const choices = data.choices as unknown[] | undefined;
  const first = choices?.[0] as Record<string, unknown> | undefined;
  const message = first?.message as Record<string, unknown> | undefined;
  const annotations = message?.annotations;
  if (!Array.isArray(annotations)) return [];

  const out: WebCitationHit[] = [];
  for (const ann of annotations) {
    if (typeof ann !== 'object' || !ann) continue;
    const a = ann as Record<string, unknown>;
    if (a.type !== 'url_citation') continue;
    const uc = a.url_citation;
    if (typeof uc !== 'object' || !uc) continue;
    const u = uc as Record<string, unknown>;
    const url = typeof u.url === 'string' ? u.url.trim() : '';
    if (!url) continue;
    out.push({
      url: normalizeUrlForMatch(url),
      title: typeof u.title === 'string' ? u.title : url,
      snippet: typeof u.content === 'string' ? u.content.slice(0, 500) : '',
    });
  }
  return out;
}

/** Last-resort: pull http(s) URLs from model text when annotations are missing. */
export function extractUrlsFromPlainText(text: string, max: number): WebCitationHit[] {
  const re = /https?:\/\/[^\s\)\]\"'<>]+/gi;
  const seen = new Set<string>();
  const out: WebCitationHit[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null && out.length < max) {
    let u = m[0].replace(/[.,;:!?)]+$/, '');
    u = normalizeUrlForMatch(u);
    if (seen.has(u)) continue;
    seen.add(u);
    out.push({ url: u, title: u, snippet: '' });
  }
  return out;
}
