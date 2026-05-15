/**
 * Social-platform brand avatar resolver (PRD A — Client Avatar Overhaul).
 *
 * Walks Instagram -> Facebook -> YouTube -> TikTok -> LinkedIn -> favicon and
 * returns the first usable image. Each leg is a public, unauthenticated scrape
 * of the platform's profile HTML, parsing og:image. Failure on any leg is
 * silent — we return null and fall through.
 *
 * Used by:
 *   - app/api/clients/analyze-url           (new prospect onboarding)
 *   - app/api/clients/[id]/refresh-logo     (admin manual refresh)
 *   - scripts/backfill-client-logos.ts      (one-shot post-deploy backfill)
 */

const FETCH_TIMEOUT_MS = 4000;
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const JINA_PROXY = 'https://r.jina.ai/';

export type AvatarSource =
  | 'instagram'
  | 'facebook'
  | 'youtube'
  | 'tiktok'
  | 'linkedin'
  | 'favicon';

export interface AvatarSocials {
  instagram?: string | null;
  facebook?: string | null;
  youtube?: string | null;
  tiktok?: string | null;
  linkedin?: string | null;
}

export interface ResolvedAvatar {
  source: AvatarSource | null;
  url: string | null;
}

/**
 * Known signatures of "default" / "anonymous" avatars that platforms return
 * when an account is private, deleted, or never set a picture. These slip
 * past a naive "did fetch return 200?" check.
 */
const DEFAULT_AVATAR_SIGNATURES = [
  // Instagram default avatar (~150-200 bytes, identifiable by URL pattern)
  /instagram\.com.*\/anonymous/i,
  // Facebook default silhouette
  /facebook\.com.*\/silhouette/i,
  // Google's generic "no favicon" globe
  /gstatic\.com\/.*\/favicon/i,
];

const MIN_AVATAR_BYTES = 1024;

async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9' },
      redirect: 'follow',
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch a profile page. Try direct first, fall back to the r.jina.ai
 * reader proxy if the platform blocks our user agent (common with IG).
 */
async function fetchProfileHtml(profileUrl: string): Promise<string | null> {
  const direct = await fetchWithTimeout(profileUrl);
  if (direct?.ok) {
    const html = await direct.text();
    if (html.length > 500) return html;
  }
  // Fallback proxy. r.jina.ai returns a readability-stripped version
  // that still contains og:image-equivalent metadata at the top.
  const proxied = await fetchWithTimeout(`${JINA_PROXY}${profileUrl}`, 6000);
  if (proxied?.ok) {
    const text = await proxied.text();
    if (text.length > 200) return text;
  }
  return null;
}

/**
 * Pull the first og:image (or matching readability-extracted "Image" line
 * when going through the jina proxy) from a fetched HTML/text blob.
 */
function extractOgImage(html: string): string | null {
  const patterns: RegExp[] = [
    /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i,
    /<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i,
    /<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i,
    /<link\s+rel=["']image_src["']\s+href=["']([^"']+)["']/i,
    // r.jina.ai readability output: "Image URL: https://..."
    /Image URL:\s*(https?:\/\/\S+)/i,
  ];
  for (const re of patterns) {
    const match = html.match(re);
    if (match?.[1]) {
      const url = match[1].trim();
      if (url.startsWith('http')) return url;
    }
  }
  return null;
}

/**
 * Verify an image URL returns a real image (not a redirect to a login wall,
 * not the platform's "default anonymous avatar", not a sub-KB 1x1 tracking gif).
 */
async function isUsableImage(url: string, minBytes = MIN_AVATAR_BYTES): Promise<boolean> {
  if (!url || !url.startsWith('http')) return false;
  if (DEFAULT_AVATAR_SIGNATURES.some((re) => re.test(url))) return false;

  const res = await fetchWithTimeout(url, 3000);
  if (!res || !res.ok) return false;

  const contentType = res.headers.get('content-type') ?? '';
  // Some CDNs serve favicons as application/octet-stream or image/vnd.microsoft.icon
  if (!contentType.startsWith('image/') && !contentType.includes('icon') && !contentType.includes('octet-stream')) {
    return false;
  }

  const contentLength = Number(res.headers.get('content-length') ?? '0');
  if (contentLength > 0 && contentLength < minBytes) return false;

  // If content-length is missing, do a partial read to confirm bytes exist.
  if (contentLength === 0) {
    try {
      const buf = await res.arrayBuffer();
      if (buf.byteLength < minBytes) return false;
    } catch {
      return false;
    }
  }
  return true;
}

// ──────────────────────────────────────────────────────────────────────────
// Per-platform resolvers. Each takes a normalized handle / URL fragment and
// returns either a usable image URL or null. Failure is silent.
// ──────────────────────────────────────────────────────────────────────────

async function resolveFromOgImage(profileUrl: string): Promise<string | null> {
  const html = await fetchProfileHtml(profileUrl);
  if (!html) return null;
  const image = extractOgImage(html);
  if (!image) return null;
  if (!(await isUsableImage(image, 256))) return null;
  return image;
}

/**
 * Instagram's public web profile info endpoint. Returns JSON with
 * `data.user.profile_pic_url_hd`. Public, no auth, no cookies required,
 * but does need the `x-ig-app-id` header to look like a web client.
 *
 * Note: the returned profile_pic CDN URL is signed and expires (~hours to
 * days). For a long-lived stored avatar, the consumer should re-resolve
 * periodically. For this app, the manual "Refresh logo" button serves
 * that purpose.
 */
async function resolveInstagram(handle: string): Promise<string | null> {
  const cleaned = handle.replace(/^@/, '').replace(/\/$/, '');
  if (!cleaned) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(cleaned)}`,
      {
        signal: controller.signal,
        headers: {
          'x-ig-app-id': '936619743392459',
          'User-Agent': USER_AGENT,
          'Accept-Language': 'en-US,en;q=0.9',
          // IG enforces Sec-Fetch + Origin/Referer to gate non-browser
          // callers. With these the same anonymous endpoint that the
          // web app uses returns 200.
          'Sec-Fetch-Site': 'same-origin',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Dest': 'empty',
          'Origin': 'https://www.instagram.com',
          'Referer': 'https://www.instagram.com/',
        },
      },
    );
    if (res.ok) {
      const json = (await res.json()) as { data?: { user?: { profile_pic_url_hd?: string; profile_pic_url?: string } } };
      const pic = json?.data?.user?.profile_pic_url_hd ?? json?.data?.user?.profile_pic_url;
      if (pic && (await isUsableImage(pic, 256))) return pic;
      console.warn(`[social-avatar] IG ${cleaned}: web_profile_info 200 but no usable pic (pic=${pic?.slice(0, 80) ?? 'null'})`);
    } else {
      console.warn(`[social-avatar] IG ${cleaned}: web_profile_info status=${res.status}`);
    }
  } catch (err) {
    console.warn(`[social-avatar] IG ${cleaned}: web_profile_info threw`, err instanceof Error ? err.message : err);
  } finally {
    clearTimeout(timer);
  }

  // Vercel datacenter IPs get blocked or rate-limited from `i.instagram.com`.
  // The public embed widget (`/{handle}/embed/`) is served to any third-party
  // origin without auth and contains the profile_pic_url in its inline JSON
  // (doubly-escaped: `\"profile_pic_url\":\"https:\\/\\/...\"`). Works from
  // server-side fetches with no special headers.
  const embed = await resolveInstagramEmbed(cleaned);
  if (embed) return embed;

  return resolveFromOgImage(`https://www.instagram.com/${cleaned}/`);
}

async function resolveInstagramEmbed(cleanedHandle: string): Promise<string | null> {
  const res = await fetchWithTimeout(`https://www.instagram.com/${cleanedHandle}/embed/`, 5000);
  if (!res?.ok) {
    console.warn(`[social-avatar] IG ${cleanedHandle}: embed status=${res?.status ?? 'null'}`);
    return null;
  }
  const html = await res.text();
  // The embed JSON-encodes the URL twice: once as a JSON string inside an
  // HTML <script> tag, so `/` is `\/` after unescaping.
  const match = html.match(/\\"profile_pic_url\\":\\"([^"\\]+(?:\\.[^"\\]*)*)\\"/);
  if (!match?.[1]) {
    console.warn(`[social-avatar] IG ${cleanedHandle}: embed page had no profile_pic_url match`);
    return null;
  }
  const decoded = match[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
  if (!(await isUsableImage(decoded, 256))) {
    console.warn(`[social-avatar] IG ${cleanedHandle}: embed pic failed isUsableImage (${decoded.slice(0, 80)})`);
    return null;
  }
  return decoded;
}

/**
 * Facebook's Graph API picture endpoint. 302-redirects to the actual CDN
 * image for any public page. Stable URL that we can persist directly —
 * the browser will follow the redirect on render.
 */
async function resolveFacebook(handle: string): Promise<string | null> {
  const cleaned = handle.replace(/^@/, '').replace(/\/$/, '');
  if (!cleaned) return null;
  const graphUrl = `https://graph.facebook.com/${encodeURIComponent(cleaned)}/picture?type=large`;
  if (await isUsableImage(graphUrl, 256)) return graphUrl;
  return resolveFromOgImage(`https://www.facebook.com/${cleaned}/`);
}

async function resolveYouTube(handleOrUrl: string): Promise<string | null> {
  let target: string;
  if (handleOrUrl.startsWith('http')) {
    target = handleOrUrl;
  } else if (handleOrUrl.startsWith('@')) {
    target = `https://www.youtube.com/${handleOrUrl}`;
  } else if (handleOrUrl.startsWith('UC') && handleOrUrl.length === 24) {
    target = `https://www.youtube.com/channel/${handleOrUrl}`;
  } else {
    target = `https://www.youtube.com/@${handleOrUrl}`;
  }
  return resolveFromOgImage(target);
}

async function resolveTikTok(handle: string): Promise<string | null> {
  const cleaned = handle.replace(/^@/, '').replace(/\/$/, '');
  if (!cleaned) return null;
  return resolveFromOgImage(`https://www.tiktok.com/@${cleaned}`);
}

async function resolveLinkedIn(handleOrUrl: string): Promise<string | null> {
  const target = handleOrUrl.startsWith('http')
    ? handleOrUrl
    : `https://www.linkedin.com/company/${handleOrUrl.replace(/^\/+|\/+$/g, '')}`;
  return resolveFromOgImage(target);
}

/**
 * Resolve the highest-quality favicon for a website. Walks
 * apple-touch-icon -> <link rel="icon"> by declared size -> /favicon.ico.
 * Returns null only when every option fails or is rejected as stale.
 */
export async function resolveFavicon(websiteUrl: string): Promise<string | null> {
  let base: URL;
  try {
    base = new URL(websiteUrl);
  } catch {
    return null;
  }

  const makeAbsolute = (raw: string): string => {
    if (raw.startsWith('//')) return `${base.protocol}${raw}`;
    if (raw.startsWith('/')) return `${base.origin}${raw}`;
    if (!raw.startsWith('http')) return `${base.origin}/${raw}`;
    return raw;
  };

  const res = await fetchWithTimeout(websiteUrl, 6000);
  let html = '';
  if (res?.ok) html = await res.text();

  // Favicons are often legitimately small (200-800 bytes). Relax the byte
  // floor for this leg so we don't reject a real brand mark for being tiny.
  const FAVICON_MIN_BYTES = 200;

  // Apple touch icon — typically 180x180+, ideal for circular avatars.
  const apple = html.match(/<link[^>]+rel=["']apple-touch-icon[^"']*["'][^>]+href=["']([^"']+)["']/i);
  if (apple?.[1]) {
    const candidate = makeAbsolute(apple[1]);
    if (await isUsableImage(candidate, FAVICON_MIN_BYTES)) return candidate;
  }

  // Largest <link rel="icon" sizes="...">. We don't parse sizes properly;
  // pick the first one with sizes attribute >=64, else any icon link.
  const iconLinks = [...html.matchAll(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]*>/gi)];
  let bestIcon: string | null = null;
  let bestSize = 0;
  for (const m of iconLinks) {
    const tag = m[0];
    const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    const sizesMatch = tag.match(/sizes=["'](\d+)x\d+["']/i);
    const size = sizesMatch ? Number(sizesMatch[1]) : 0;
    if (size > bestSize) {
      bestSize = size;
      bestIcon = makeAbsolute(hrefMatch[1]);
    } else if (!bestIcon) {
      bestIcon = makeAbsolute(hrefMatch[1]);
    }
  }
  if (bestIcon && (await isUsableImage(bestIcon, FAVICON_MIN_BYTES))) return bestIcon;

  // Last-ditch: /favicon.ico at the origin.
  const fallback = `${base.origin}/favicon.ico`;
  if (await isUsableImage(fallback, FAVICON_MIN_BYTES)) return fallback;

  return null;
}

/**
 * Orchestrate the full chain. Returns the first leg that yields a usable
 * image, or { source: null, url: null } when nothing fires.
 */
export async function resolveBrandAvatar({
  website,
  socials,
}: {
  website?: string | null;
  socials?: AvatarSocials | null;
}): Promise<ResolvedAvatar> {
  const s = socials ?? {};
  const chain: Array<{ source: AvatarSource; run: () => Promise<string | null> }> = [];

  if (s.instagram) chain.push({ source: 'instagram', run: () => resolveInstagram(s.instagram!) });
  if (s.facebook) chain.push({ source: 'facebook', run: () => resolveFacebook(s.facebook!) });
  if (s.youtube) chain.push({ source: 'youtube', run: () => resolveYouTube(s.youtube!) });
  if (s.tiktok) chain.push({ source: 'tiktok', run: () => resolveTikTok(s.tiktok!) });
  if (s.linkedin) chain.push({ source: 'linkedin', run: () => resolveLinkedIn(s.linkedin!) });

  for (const leg of chain) {
    const url = await leg.run();
    if (url) return { source: leg.source, url };
  }

  if (website) {
    const fav = await resolveFavicon(website);
    if (fav) return { source: 'favicon', url: fav };
  }

  return { source: null, url: null };
}
