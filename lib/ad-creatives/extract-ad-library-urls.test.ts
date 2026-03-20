import { describe, it, expect } from 'vitest';
import { extractMetaAdLibraryImageUrls, isMetaAdLibraryUrl } from '@/lib/ad-creatives/extract-ad-library-urls';

/** scontent-style URLs must be ≥48 chars per extractor */
const LONG_JPG =
  'https://scontent-dfw5-1.xx.fbcdn.net/v/t39.35426-6/1234567890123456789012345678901234567890_n.jpg?stp=dst-jpg_s600x600_tt6&_nc_cat=108&ccb=1-7';

const LONG_WEBP =
  'https://scontent-atl3-2.cdninstagram.com/v/t51.2885-15/9876543210987654321098765432109876543210_n.webp?_nc_ht=scontent-atl3-2.cdninstagram.com';

describe('isMetaAdLibraryUrl', () => {
  it('returns true for facebook ads library paths', () => {
    expect(
      isMetaAdLibraryUrl('https://www.facebook.com/ads/library/?active_status=all&ad_type=all'),
    ).toBe(true);
    expect(isMetaAdLibraryUrl('https://facebook.com/ads/library/?id=123')).toBe(true);
  });

  it('returns false for other hosts or paths', () => {
    expect(isMetaAdLibraryUrl('https://www.meta.com/')).toBe(false);
    expect(isMetaAdLibraryUrl('https://www.facebook.com/marketplace/')).toBe(false);
    expect(isMetaAdLibraryUrl('not-a-url')).toBe(false);
  });
});

describe('extractMetaAdLibraryImageUrls', () => {
  it('returns empty array for empty HTML', () => {
    expect(extractMetaAdLibraryImageUrls('')).toEqual([]);
  });

  it('extracts scontent / fbcdn image URLs from raw HTML', () => {
    const html = `<script>window.__DATA__ = "${LONG_JPG}"; var x = "${LONG_WEBP}"</script>`;
    const urls = extractMetaAdLibraryImageUrls(html);
    expect(urls).toContain(LONG_JPG);
    expect(urls).toContain(LONG_WEBP);
    expect(urls.length).toBe(2);
  });

  it('normalizes JSON-escaped slashes (\\/)', () => {
    const escaped = LONG_JPG.replace(/\//g, '\\/');
    const html = `{"img":"${escaped}"}`;
    expect(extractMetaAdLibraryImageUrls(html)).toContain(LONG_JPG);
  });

  it('dedupes identical URLs', () => {
    const html = `${LONG_JPG} ${LONG_JPG} ${LONG_JPG}`;
    expect(extractMetaAdLibraryImageUrls(html)).toEqual([LONG_JPG]);
  });

  it('skips URLs shorter than 48 characters', () => {
    const short = 'https://scontent.xx.fbcdn.net/x.jpg';
    expect(short.length).toBeLessThan(48);
    const html = `${short} ${LONG_JPG}`;
    expect(extractMetaAdLibraryImageUrls(html)).toEqual([LONG_JPG]);
  });

  it('filters noise patterns (gif, emoji, 1x1, pixel, tracking)', () => {
    const html = [
      LONG_JPG,
      'https://scontent.xx.fbcdn.net/v/emoji/sticker_48x48.gif',
      'https://scontent.xx.fbcdn.net/trackingpixel_100x100.png?cb=1',
      'https://scontent.xx.fbcdn.net/ads/1x1_transparent.png',
    ].join(' ');
    const urls = extractMetaAdLibraryImageUrls(html);
    expect(urls).toEqual([LONG_JPG]);
  });

  it('caps at 50 unique URLs', () => {
    const urls: string[] = [];
    for (let i = 0; i < 55; i++) {
      const pad = String(i).padStart(30, '0');
      urls.push(
        `https://scontent-test.xx.fbcdn.net/v/t39.35426-6/${pad}_n.jpg?nc_extra=${pad}`,
      );
    }
    const html = urls.join(' ');
    const out = extractMetaAdLibraryImageUrls(html);
    expect(out.length).toBe(50);
  });
});
