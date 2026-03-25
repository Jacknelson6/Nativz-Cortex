import { describe, expect, it } from 'vitest';
import { dedupeUrls, normalizeUrlForMatch } from '@/lib/search/tools/urls';

describe('normalizeUrlForMatch', () => {
  it('strips hash and trailing slash on path', () => {
    expect(normalizeUrlForMatch('https://example.com/foo/bar/#section')).toBe('https://example.com/foo/bar');
    expect(normalizeUrlForMatch('https://example.com/foo/')).toBe('https://example.com/foo');
  });

  it('returns trimmed string on invalid URL', () => {
    expect(normalizeUrlForMatch('  not-a-url  ')).toBe('not-a-url');
  });
});

describe('dedupeUrls', () => {
  it('removes duplicates after normalization', () => {
    const out = dedupeUrls([
      'https://a.com/x',
      'https://a.com/x/',
      'https://b.com/y',
    ]);
    expect(out).toEqual(['https://a.com/x', 'https://b.com/y']);
  });

  it('keeps a single root host URL', () => {
    expect(dedupeUrls(['https://ok.com'])).toEqual(['https://ok.com/']);
  });
});
