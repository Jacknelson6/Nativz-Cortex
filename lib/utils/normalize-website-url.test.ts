import { describe, expect, it } from 'vitest';
import {
  isValidWebsiteUrl,
  normalizeWebsiteUrl,
  tryParseUserWebsite,
} from './normalize-website-url';

/**
 * normalize-website-url backs every "your website" intake field — onboarding
 * intake, brand DNA settings, client-create form. Three contracts to pin:
 *
 *   1. http:// always upgrades to https:// for non-localhost inputs. We
 *      embed brand websites in iframes / link out to them from the portal,
 *      and a mixed-content http embed silently fails inside our https
 *      pages. The dev / loopback exception is intentional — local stacks
 *      legitimately serve over http.
 *
 *   2. isValidWebsiteUrl requires a literal `.` in the hostname for non-
 *      loopback hosts. A user typing "store" without a TLD must fail
 *      validation rather than be treated as a real URL — otherwise the
 *      brand DNA pipeline would crawl `https://store/` and 500.
 *
 *   3. tryParseUserWebsite strips a leading `www.` from the display label
 *      but keeps it in the normalized URL. The display label is what we
 *      show in client cards and brand pills; "example.com" reads cleaner
 *      than "www.example.com".
 */

describe('normalizeWebsiteUrl', () => {
  it('returns empty string for empty / whitespace input', () => {
    expect(normalizeWebsiteUrl('')).toBe('');
    expect(normalizeWebsiteUrl('   ')).toBe('');
  });

  it('adds https:// to a bare domain', () => {
    expect(normalizeWebsiteUrl('example.com')).toBe('https://example.com');
  });

  it('preserves an existing https:// URL', () => {
    expect(normalizeWebsiteUrl('https://example.com')).toBe('https://example.com');
  });

  it('upgrades http:// to https:// for non-localhost', () => {
    expect(normalizeWebsiteUrl('http://example.com')).toBe('https://example.com');
  });

  it('keeps http:// for localhost (dev / loopback exception)', () => {
    expect(normalizeWebsiteUrl('localhost:3000')).toBe('http://localhost:3000');
    expect(normalizeWebsiteUrl('localhost')).toBe('http://localhost');
  });

  it('keeps http:// for 127.0.0.1', () => {
    expect(normalizeWebsiteUrl('127.0.0.1:8080')).toBe('http://127.0.0.1:8080');
  });

  it('trims surrounding whitespace before deciding the scheme', () => {
    expect(normalizeWebsiteUrl('  example.com  ')).toBe('https://example.com');
  });

  it('is case-insensitive on the existing scheme', () => {
    expect(normalizeWebsiteUrl('HTTPS://example.com')).toBe('HTTPS://example.com');
    expect(normalizeWebsiteUrl('HTTP://example.com')).toBe('https://example.com');
  });
});

describe('isValidWebsiteUrl', () => {
  it('returns false for empty input', () => {
    expect(isValidWebsiteUrl('')).toBe(false);
  });

  it('accepts an https:// URL with a real hostname', () => {
    expect(isValidWebsiteUrl('https://example.com')).toBe(true);
  });

  it('accepts http://localhost (dev exception)', () => {
    expect(isValidWebsiteUrl('http://localhost:3000')).toBe(true);
  });

  it('accepts http://127.0.0.1 (loopback exception)', () => {
    expect(isValidWebsiteUrl('http://127.0.0.1:8080')).toBe(true);
  });

  it('rejects a hostname with no dot (e.g. "store")', () => {
    expect(isValidWebsiteUrl('https://store')).toBe(false);
  });

  it('rejects non-http(s) protocols', () => {
    expect(isValidWebsiteUrl('ftp://example.com')).toBe(false);
    expect(isValidWebsiteUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects an unparseable URL', () => {
    expect(isValidWebsiteUrl('not a url')).toBe(false);
  });
});

describe('tryParseUserWebsite', () => {
  it('returns null for empty input', () => {
    expect(tryParseUserWebsite('')).toBeNull();
  });

  it('returns null for an invalid URL (no TLD)', () => {
    expect(tryParseUserWebsite('store')).toBeNull();
  });

  it('returns the normalized https URL and a www-stripped label', () => {
    expect(tryParseUserWebsite('www.example.com')).toEqual({
      normalized: 'https://www.example.com',
      displayLabel: 'example.com',
    });
  });

  it('keeps the hostname as the label when there is no www. prefix', () => {
    expect(tryParseUserWebsite('example.com')).toEqual({
      normalized: 'https://example.com',
      displayLabel: 'example.com',
    });
  });

  it('handles localhost without stripping anything', () => {
    expect(tryParseUserWebsite('localhost:3000')).toEqual({
      normalized: 'http://localhost:3000',
      displayLabel: 'localhost',
    });
  });

  it('strips www. case-insensitively', () => {
    expect(tryParseUserWebsite('WWW.example.com')?.displayLabel).toBe('example.com');
  });
});
