/**
 * HTML fetch for ad-wizard / quick brand scrapes.
 *
 * Order:
 * 1. Plain `fetch` (fast).
 * 2. If the document looks like an empty JS shell, or fetch failed, try optional Scrapling sidecar.
 * 3. Then optional Playwright (playwright-core + local Chromium).
 *
 * Env (optional):
 * - `SCRAPLING_FETCH_URL` — POST endpoint; body `{ "url": string, "mode"?: "fetcher"|"stealthy"|"dynamic" }`; response `{ "html": string }`.
 * - `SCRAPLING_FETCH_SECRET` — if set, sent as `Authorization: Bearer <secret>`.
 * - `SCRAPLING_FETCH_MODE` — default mode for the sidecar (default `dynamic`).
 * - `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` — path to Chromium for Playwright fallback.
 * - `AD_BRAND_SCRAPE_DISABLE_PLAYWRIGHT` — set to `1` to skip Playwright (Scrapling-only / serverless).
 *
 * Run the sidecar: see `scripts/scrapling-fetch-server.py`.
 */

const PLAIN_TIMEOUT_MS = 15_000;
const SCRAPLING_TIMEOUT_MS = 120_000;
const PLAYWRIGHT_TIMEOUT_MS = 45_000;

function visibleTextLength(html: string): number {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  return stripped.replace(/\s+/g, ' ').trim().length;
}

/** True when the HTML is probably a client-rendered shell with little SSR content. */
export function isLikelyJsShellDocument(html: string): boolean {
  const head = html.slice(0, 100_000).toLowerCase();
  const len = visibleTextLength(html);
  if (len > 900) return false;
  if (head.includes('enable javascript') || head.includes('javascript is required')) return true;
  if (head.includes('id="root"') && len < 400) return true;
  if (head.includes("id='root'") && len < 400) return true;
  if (head.includes('id="__next"') && len < 400) return true;
  if (head.includes('ng-app') && len < 250) return true;
  return len < 200;
}

async function tryPlainFetch(url: string): Promise<{ html: string } | null> {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(PLAIN_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const html = await res.text();
  return html ? { html } : null;
}

type ScraplingMode = 'fetcher' | 'stealthy' | 'dynamic';

async function tryScraplingService(pageUrl: string): Promise<string | null> {
  const endpoint = process.env.SCRAPLING_FETCH_URL?.trim();
  if (!endpoint) return null;

  const modeRaw = (process.env.SCRAPLING_FETCH_MODE ?? 'dynamic').trim().toLowerCase();
  const mode: ScraplingMode =
    modeRaw === 'fetcher' || modeRaw === 'stealthy' || modeRaw === 'dynamic' ? modeRaw : 'dynamic';

  const secret = process.env.SCRAPLING_FETCH_SECRET?.trim();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (secret) headers.Authorization = `Bearer ${secret}`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ url: pageUrl, mode }),
    signal: AbortSignal.timeout(SCRAPLING_TIMEOUT_MS),
  });

  if (!res.ok) {
    console.warn('[fetch-page-for-scrape] Scrapling service HTTP', res.status);
    return null;
  }

  const data = (await res.json().catch(() => ({}))) as { html?: unknown };
  return typeof data.html === 'string' && data.html.length > 0 ? data.html : null;
}

async function tryPlaywright(pageUrl: string): Promise<string | null> {
  if (process.env.AD_BRAND_SCRAPE_DISABLE_PLAYWRIGHT === '1') return null;

  let browser: import('playwright-core').Browser | undefined;
  try {
    const { chromium } = await import('playwright-core');
    const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim() || undefined;

    browser = await chromium.launch({
      headless: true,
      executablePath,
      args: ['--disable-gpu', '--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.goto(pageUrl, {
      waitUntil: 'domcontentloaded',
      timeout: PLAYWRIGHT_TIMEOUT_MS,
    });
    await new Promise((r) => setTimeout(r, 2500));
    const html = await page.content();
    return html.length > 0 ? html : null;
  } catch (e) {
    console.warn('[fetch-page-for-scrape] Playwright failed:', e);
    return null;
  } finally {
    await browser?.close().catch(() => {});
  }
}

export async function fetchHtmlForBrandScrape(url: string): Promise<string> {
  let plain: string | null = null;

  try {
    const got = await tryPlainFetch(url);
    if (got) plain = got.html;
  } catch {
    /* fall through to Scrapling / Playwright */
  }

  const weakPlain = plain != null && isLikelyJsShellDocument(plain);
  const needFallback = plain == null || weakPlain;

  if (!needFallback && plain != null) {
    return plain;
  }

  const scraplingHtml = await tryScraplingService(url).catch((e) => {
    console.warn('[fetch-page-for-scrape] Scrapling service error:', e);
    return null;
  });
  if (scraplingHtml && (!isLikelyJsShellDocument(scraplingHtml) || plain == null)) {
    return scraplingHtml;
  }

  const pwHtml = await tryPlaywright(url);
  if (pwHtml) return pwHtml;

  if (scraplingHtml) return scraplingHtml;
  if (plain != null) return plain;

  throw new Error(`Failed to fetch URL`);
}
