/**
 * SearXNG `engines` query param for **general web** SERP (not reddit/youtube-specific calls).
 * Default `duckduckgo` — override if your instance uses different engine ids or you want a blend
 * (e.g. `duckduckgo,startpage`).
 *
 * Env: `SEARXNG_WEB_ENGINES` — empty/unset → `duckduckgo`.
 */
export function getSearxngWebEngines(): string {
  const e = process.env.SEARXNG_WEB_ENGINES?.trim();
  return e || 'duckduckgo';
}
