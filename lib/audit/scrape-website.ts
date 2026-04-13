/**
 * Scrape a website to extract business context + social media profile links.
 */

import type { SocialLink, AuditPlatform } from './types';

export interface WebsiteScrapeResult {
  url: string;
  title: string;
  description: string;
  bodyText: string;
  socialLinks: SocialLink[];
}

const SOCIAL_PATTERNS: { platform: AuditPlatform; regex: RegExp; extractUsername: (url: string) => string }[] = [
  {
    platform: 'tiktok',
    regex: /(?:https?:)?\/\/(?:www\.)?tiktok\.com\/@([\w.]+)/gi,
    extractUsername: (url) => url.match(/@([\w.]+)/)?.[1] ?? '',
  },
  {
    platform: 'instagram',
    regex: /(?:https?:)?\/\/(?:www\.)?instagram\.com\/([\w.]+)\/?(?:[?#]|$)/gi,
    extractUsername: (url) => url.match(/instagram\.com\/([\w.]+)/)?.[1] ?? '',
  },
  {
    platform: 'facebook',
    // Matches:
    //   facebook.com/username
    //   www.facebook.com/username, m.facebook.com/username, business.facebook.com/username
    //   fb.com/username
    //   facebook.com/pages/Name-Goes-Here/123456
    //   facebook.com/profile.php?id=123456
    regex: /(?:https?:)?\/\/(?:(?:www|m|web|business|l)\.)?(?:facebook|fb)\.com\/(?:pages\/[^/]+\/(\d+)|profile\.php\?id=(\d+)|([\w.-]+))/gi,
    extractUsername: (url) => {
      const pagesMatch = url.match(/facebook\.com\/pages\/[^/]+\/(\d+)/i);
      if (pagesMatch) return pagesMatch[1];
      const profileIdMatch = url.match(/profile\.php\?id=(\d+)/i);
      if (profileIdMatch) return profileIdMatch[1];
      const simpleMatch = url.match(/(?:facebook|fb)\.com\/([\w.-]+)/i);
      return simpleMatch?.[1] ?? '';
    },
  },
  {
    platform: 'youtube',
    regex: /(?:https?:)?\/\/(?:www\.)?youtube\.com\/(@[\w-]+|channel\/[\w-]+|c\/[\w-]+)\/?/gi,
    extractUsername: (url) => url.match(/youtube\.com\/(@?[\w-]+|channel\/[\w-]+|c\/[\w-]+)/)?.[1] ?? '',
  },
  {
    platform: 'linkedin',
    regex: /(?:https?:)?\/\/(?:www\.)?linkedin\.com\/(company|in)\/([\w-]+)\/?/gi,
    extractUsername: (url) => url.match(/linkedin\.com\/(?:company|in)\/([\w-]+)/)?.[1] ?? '',
  },
];

// Filter out generic non-profile paths
const EXCLUDED_USERNAMES = new Set([
  'share', 'sharer', 'intent', 'hashtag', 'explore', 'p', 'reel',
  'watch', 'shorts', 'feed', 'stories', 'about', 'login', 'signup',
  'help', 'settings', 'direct', 'accounts', 'directory', 'groups',
  'pages', 'marketplace', 'gaming', 'events', 'bookmarks', 'saved',
  'tr', 'ar', 'privacy', 'policy', 'terms', 'legal', 'jobs',
]);

export async function scrapeWebsite(url: string): Promise<WebsiteScrapeResult> {
  const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;

  console.log(`[audit] Scraping website: ${normalizedUrl}`);

  const res = await fetch(normalizedUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; NativzCortex/1.0; +https://cortex.nativz.io)',
      'Accept': 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(15000),
    redirect: 'follow',
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch website (${res.status}): ${normalizedUrl}`);
  }

  const html = await res.text();

  // Extract title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : '';

  // Extract meta description
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i)
    ?? html.match(/<meta[^>]*content=["']([\s\S]*?)["'][^>]*name=["']description["']/i);
  const description = descMatch ? decodeHtmlEntities(descMatch[1].trim()) : '';

  // Extract visible body text
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  let bodyText = '';
  if (bodyMatch) {
    bodyText = bodyMatch[1]
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 3000);
  }

  // Extract social media links from the full HTML
  const socialLinks = extractSocialLinks(html);

  console.log(`[audit] Website scraped: "${title}" (${bodyText.length} chars, ${socialLinks.length} social links found)`);

  return { url: normalizedUrl, title, description, bodyText, socialLinks };
}

function extractSocialLinks(html: string): SocialLink[] {
  const found: SocialLink[] = [];
  const seen = new Set<string>();

  function addLink(platform: AuditPlatform, fullUrl: string, username: string) {
    if (!username || EXCLUDED_USERNAMES.has(username.toLowerCase())) return;
    const key = `${platform}:${username.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ platform, url: fullUrl, username });
  }

  // Pass 1: Regex scan across entire HTML text
  for (const pattern of SOCIAL_PATTERNS) {
    const matches = html.matchAll(pattern.regex);
    for (const match of matches) {
      addLink(pattern.platform, match[0], pattern.extractUsername(match[0]));
    }
  }

  // Pass 2: Extract href values from <a> tags and re-check
  // This catches URL-encoded links, links built with entities, and links
  // the global regex missed because of surrounding HTML attributes.
  const hrefRegex = /href=["']((?:https?:)?\/\/[^"']+)["']/gi;
  for (const hm of html.matchAll(hrefRegex)) {
    const href = decodeHtmlEntities(hm[1]);
    for (const pattern of SOCIAL_PATTERNS) {
      // Reset lastIndex since we're reusing the regex on a different string
      pattern.regex.lastIndex = 0;
      if (pattern.regex.test(href)) {
        pattern.regex.lastIndex = 0;
        addLink(pattern.platform, href, pattern.extractUsername(href));
      }
    }
  }

  return found;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}
