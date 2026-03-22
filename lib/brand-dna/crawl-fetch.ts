const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (compatible; NativzBot/1.0; +https://nativz.io) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  const seconds = parseInt(trimmed, 10);
  if (!Number.isNaN(seconds) && seconds >= 0 && seconds < 86_400) return seconds * 1000;
  const when = Date.parse(trimmed);
  if (!Number.isNaN(when)) return Math.max(0, when - Date.now());
  return null;
}

export class HostPacer {
  private lastComplete = 0;
  private intervalMs: number;
  private floorMs: number;
  private readonly capMs: number;

  constructor(initialMs: number, floorMs: number, capMs: number) {
    this.intervalMs = initialMs;
    this.floorMs = floorMs;
    this.capMs = capMs;
  }

  /** Raise minimum delay (e.g. from robots Crawl-delay). */
  setFloor(ms: number): void {
    this.floorMs = Math.max(this.floorMs, ms);
    this.intervalMs = Math.max(this.intervalMs, this.floorMs);
  }

  async waitTurn(): Promise<void> {
    const now = Date.now();
    const wait = Math.max(0, this.lastComplete + this.intervalMs - now);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }

  recordComplete(): void {
    this.lastComplete = Date.now();
  }

  noteSuccess(): void {
    this.intervalMs = Math.max(this.floorMs, Math.floor(this.intervalMs * 0.92));
  }

  noteThrottle(): void {
    this.intervalMs = Math.min(this.capMs, Math.floor(this.intervalMs * 1.5));
  }
}

export type FetchTextResult = {
  ok: boolean;
  status: number;
  text: string | null;
  contentType: string;
  headers: Headers;
};

export async function fetchTextOnce(
  url: string,
  timeoutMs: number,
  userAgent = DEFAULT_USER_AGENT,
  acceptXml = false
): Promise<FetchTextResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': userAgent,
        Accept: acceptXml
          ? 'text/html,application/xhtml+xml,application/xml;q=0.9,text/xml;q=0.8,*/*;q=0.5'
          : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    const contentType = res.headers.get('content-type') ?? '';
    const text = await res.text();
    return { ok: res.ok, status: res.status, text, contentType, headers: res.headers };
  } catch {
    return { ok: false, status: 0, text: null, contentType: '', headers: new Headers() };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchTextWithRetries(
  url: string,
  options: {
    timeoutMs: number;
    pacer: HostPacer;
    userAgent?: string;
    acceptXml?: boolean;
    maxRetries?: number;
  }
): Promise<string | null> {
  const { timeoutMs, pacer, userAgent, acceptXml, maxRetries = 2 } = options;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await pacer.waitTurn();
    const res = await fetchTextOnce(url, timeoutMs, userAgent, acceptXml ?? false);
    pacer.recordComplete();

    const ct = res.contentType;
    const htmlish =
      ct.includes('text/html') ||
      ct.includes('application/xhtml') ||
      ct.includes('application/xml') ||
      ct.includes('text/xml');

    if (res.ok && res.text && (acceptXml ? htmlish || ct.includes('xml') : htmlish)) {
      pacer.noteSuccess();
      return res.text;
    }

    if (res.ok && res.text && !htmlish) {
      return null;
    }

    if (res.status === 429 || res.status === 503) {
      pacer.noteThrottle();
      const ra = parseRetryAfterMs(res.headers.get('retry-after'));
      const backoff = ra ?? Math.min(8000, 1000 * (attempt + 1));
      await new Promise((r) => setTimeout(r, backoff));
      continue;
    }

    if (attempt === maxRetries) return null;
    if (res.status >= 500 && res.status < 600) {
      pacer.noteThrottle();
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
      continue;
    }

    return null;
  }
  return null;
}
