// SPY-02 T01: classify a seed URL pasted by the sales rep into either a
// generic website or a known social-profile shape. Pure / deterministic.
//
// Decision (PRD D-01): accept either form. A website seed runs the full
// website scrape branch; a social-profile seed jumps straight into
// cross-platform handle resolution.

import type { ProspectPlatform } from './types';

export type UrlClassification =
  | {
      kind: 'website';
      platform: null;
      handle: null;
      canonicalUrl: string;
    }
  | {
      kind: 'social_profile';
      platform: ProspectPlatform;
      handle: string;
      canonicalUrl: string;
    };

const DISALLOWED_SCHEMES = ['mailto:', 'javascript:', 'tel:', 'sms:', 'data:'];

// Username segments that appear in social URLs but are NOT profile handles.
// Mirrors `EXCLUDED_USERNAMES` in lib/audit/scrape-website.ts so we stay
// consistent when sniffing a profile URL.
const EXCLUDED_HANDLE_SEGMENTS = new Set([
  'share',
  'sharer',
  'intent',
  'hashtag',
  'explore',
  'p',
  'reel',
  'reels',
  'watch',
  'shorts',
  'feed',
  'stories',
  'about',
  'login',
  'signup',
  'help',
  'settings',
  'tag',
  'video',
  'pages',
  'profile.php',
  '@', // catches bare "/@"
]);

function normaliseUrlString(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  // Tolerate users pasting bare hosts.
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

function safeUrl(input: string): URL | null {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

function isExcludedHandle(segment: string): boolean {
  return EXCLUDED_HANDLE_SEGMENTS.has(segment.toLowerCase());
}

// Extract a handle from a TikTok URL. Handles `@brand` profile, video
// permalinks (`/@brand/video/123`), and bare `/@brand`. Returns null if
// the page is a generic / non-profile path (explore, foryou, etc).
function classifyTikTok(url: URL): UrlClassification | null {
  const path = url.pathname.replace(/\/+$/, '');
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return null;
  const first = segments[0];
  if (first.startsWith('@')) {
    const handle = first.slice(1);
    if (!handle || isExcludedHandle(handle)) return null;
    return {
      kind: 'social_profile',
      platform: 'tiktok',
      handle,
      canonicalUrl: `https://www.tiktok.com/@${handle}`,
    };
  }
  return null;
}

function classifyInstagram(url: URL): UrlClassification | null {
  const path = url.pathname.replace(/\/+$/, '');
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return null;
  const first = segments[0];
  if (isExcludedHandle(first)) return null;
  // /p/<shortcode>, /reel/<shortcode> are post URLs, not profiles.
  if (first === 'p' || first === 'reel' || first === 'reels' || first === 'tv') return null;
  const handle = first.replace(/^@/, '');
  if (!handle) return null;
  return {
    kind: 'social_profile',
    platform: 'instagram',
    handle,
    canonicalUrl: `https://www.instagram.com/${handle}/`,
  };
}

function classifyYouTube(url: URL): UrlClassification | null {
  const path = url.pathname.replace(/\/+$/, '');
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  // /@handle
  if (segments[0].startsWith('@')) {
    const handle = segments[0].slice(1);
    if (!handle) return null;
    return {
      kind: 'social_profile',
      platform: 'youtube',
      handle,
      canonicalUrl: `https://www.youtube.com/@${handle}`,
    };
  }
  // /channel/UCxxx
  if (segments[0] === 'channel' && segments[1]) {
    return {
      kind: 'social_profile',
      platform: 'youtube',
      handle: segments[1],
      canonicalUrl: `https://www.youtube.com/channel/${segments[1]}`,
    };
  }
  // /c/CustomName
  if (segments[0] === 'c' && segments[1]) {
    return {
      kind: 'social_profile',
      platform: 'youtube',
      handle: segments[1],
      canonicalUrl: `https://www.youtube.com/c/${segments[1]}`,
    };
  }
  // /user/Legacy
  if (segments[0] === 'user' && segments[1]) {
    return {
      kind: 'social_profile',
      platform: 'youtube',
      handle: segments[1],
      canonicalUrl: `https://www.youtube.com/user/${segments[1]}`,
    };
  }
  return null;
}

function classifyFacebook(url: URL): UrlClassification | null {
  const path = url.pathname.replace(/\/+$/, '');
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  // /pages/Name/123456 → numeric ID is the handle
  if (segments[0] === 'pages' && segments[2]) {
    return {
      kind: 'social_profile',
      platform: 'facebook',
      handle: segments[2],
      canonicalUrl: `https://www.facebook.com/pages/${segments[1]}/${segments[2]}`,
    };
  }
  // /profile.php?id=123 → numeric id query param
  if (segments[0] === 'profile.php') {
    const id = url.searchParams.get('id');
    if (id) {
      return {
        kind: 'social_profile',
        platform: 'facebook',
        handle: id,
        canonicalUrl: `https://www.facebook.com/profile.php?id=${id}`,
      };
    }
    return null;
  }
  const first = segments[0];
  if (isExcludedHandle(first)) return null;
  return {
    kind: 'social_profile',
    platform: 'facebook',
    handle: first,
    canonicalUrl: `https://www.facebook.com/${first}`,
  };
}

const SOCIAL_HOST_CLASSIFIERS: Array<{
  match: (host: string) => boolean;
  classify: (url: URL) => UrlClassification | null;
}> = [
  { match: (h) => /(^|\.)tiktok\.com$/.test(h), classify: classifyTikTok },
  { match: (h) => /(^|\.)instagram\.com$/.test(h), classify: classifyInstagram },
  { match: (h) => /(^|\.)youtube\.com$/.test(h) || h === 'youtu.be', classify: classifyYouTube },
  { match: (h) => /(^|\.)(facebook|fb)\.com$/.test(h), classify: classifyFacebook },
];

export function classifyUrl(input: string): UrlClassification | null {
  if (!input || typeof input !== 'string') return null;
  const normalised = normaliseUrlString(input);
  if (!normalised) return null;

  // Reject disallowed schemes before letting URL() parse them — `new
  // URL('mailto:x@y.com')` succeeds but should not classify.
  const lower = normalised.toLowerCase();
  if (DISALLOWED_SCHEMES.some((s) => lower.startsWith(s))) return null;

  const url = safeUrl(normalised);
  if (!url) return null;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!host) return null;

  for (const { match, classify } of SOCIAL_HOST_CLASSIFIERS) {
    if (match(host)) {
      const result = classify(url);
      if (result) return result;
      // Recognised host but not a profile URL (e.g. /explore on IG).
      // Fall through to treating the host as a website seed.
    }
  }

  // Otherwise: a plain website. Strip query + fragment for canonical form.
  const canonicalUrl = `${url.protocol}//${url.hostname}${url.pathname.replace(/\/+$/, '') || '/'}`;
  return { kind: 'website', platform: null, handle: null, canonicalUrl };
}
