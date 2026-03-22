import { describe, expect, it } from 'vitest';
import { parseRetryAfterMs } from './crawl-fetch';
import {
  buildRobotsPolicy,
  pathnameAllowedByRules,
  parseRobotsTxtIntoBlocks,
  robotsPatternMatches,
} from './crawl-robots';
import {
  brandDnaUrlCrawlPriority,
  isBrandDnaCrawlExcluded,
  normalizeUrl,
} from './crawl';

describe('isBrandDnaCrawlExcluded', () => {
  it('blocks cart, auth, and wp-admin paths', () => {
    expect(isBrandDnaCrawlExcluded('https://example.com/cart')).toBe(true);
    expect(isBrandDnaCrawlExcluded('https://example.com/checkout/summary')).toBe(true);
    expect(isBrandDnaCrawlExcluded('https://example.com/account/settings')).toBe(true);
    expect(isBrandDnaCrawlExcluded('https://example.com/wp-admin/')).toBe(true);
    expect(isBrandDnaCrawlExcluded('https://example.com/login')).toBe(true);
  });

  it('allows marketing pages', () => {
    expect(isBrandDnaCrawlExcluded('https://example.com/about')).toBe(false);
    expect(isBrandDnaCrawlExcluded('https://example.com/products/widgets')).toBe(false);
  });
});

describe('brandDnaUrlCrawlPriority', () => {
  it('ranks brand-rich paths above deep tag archives', () => {
    const about = brandDnaUrlCrawlPriority('https://x.com/about-us');
    const product = brandDnaUrlCrawlPriority('https://x.com/pricing/plans');
    const tag = brandDnaUrlCrawlPriority('https://x.com/blog/tag/announcements/page/3');
    expect(about).toBeGreaterThan(tag);
    expect(product).toBeGreaterThan(tag);
  });
});

describe('normalizeUrl', () => {
  it('rejects non-http protocols', () => {
    expect(normalizeUrl('javascript:void(0)', 'https://example.com')).toBeNull();
    expect(normalizeUrl('mailto:a@b.com', 'https://example.com')).toBeNull();
  });

  it('strips hash and trailing slash', () => {
    expect(normalizeUrl('/foo#bar', 'https://example.com')).toBe('https://example.com/foo');
  });
});

describe('robotsPatternMatches', () => {
  it('matches path prefixes', () => {
    expect(robotsPatternMatches('/admin/users', '/admin')).toBe(true);
    expect(robotsPatternMatches('/public', '/admin')).toBe(false);
  });

  it('treats disallow / as site-wide', () => {
    expect(robotsPatternMatches('/anything', '/')).toBe(true);
  });
});

describe('pathnameAllowedByRules', () => {
  it('prefers the longest matching allow over a shorter disallow', () => {
    const allowed = pathnameAllowedByRules('/private/exception', [
      { kind: 'disallow', path: '/private/' },
      { kind: 'allow', path: '/private/exception' },
    ]);
    expect(allowed).toBe(true);
  });
});

describe('buildRobotsPolicy', () => {
  it('blocks paths for NativzBot when disallowed for *', () => {
    const txt = `User-agent: *\nDisallow: /secret/\n`;
    const p = buildRobotsPolicy(txt);
    expect(p.isPathAllowed('/secret/page')).toBe(false);
    expect(p.isPathAllowed('/about')).toBe(true);
  });

  it('honors crawl-delay for matching user-agents', () => {
    const txt = `User-agent: *\nCrawl-delay: 2\n`;
    const p = buildRobotsPolicy(txt);
    expect(p.minIntervalMs).toBeGreaterThanOrEqual(2000);
  });

  it('merges consecutive user-agent lines into one block', () => {
    const txt = `User-agent: a\nUser-agent: b\nDisallow: /x\n`;
    const blocks = parseRobotsTxtIntoBlocks(txt);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.agents).toEqual(['a', 'b']);
  });
});

describe('parseRetryAfterMs', () => {
  it('parses delay-seconds', () => {
    expect(parseRetryAfterMs('3')).toBe(3000);
  });

  it('returns null for junk', () => {
    expect(parseRetryAfterMs('')).toBeNull();
  });
});
