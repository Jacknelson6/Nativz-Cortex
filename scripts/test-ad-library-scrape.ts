/**
 * Fetch a page (e.g. Meta Ad Library) and print URLs that extractMetaAdLibraryImageUrls would pick up.
 *
 * Usage:
 *   npx tsx scripts/test-ad-library-scrape.ts "https://www.facebook.com/ads/library/?..."
 *
 * This does not call the Cortex API or upload images — it only mirrors the HTML fetch + extraction step.
 */

import { extractMetaAdLibraryImageUrls, isMetaAdLibraryUrl } from '../lib/ad-creatives/extract-ad-library-urls';

const url = process.argv[2];

if (!url) {
  console.error('Usage: npx tsx scripts/test-ad-library-scrape.ts <page-url>');
  process.exit(1);
}

async function main() {
  console.log('URL:', url);
  console.log('isMetaAdLibraryUrl:', isMetaAdLibraryUrl(url));

  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    console.error('Fetch failed:', res.status, res.statusText);
    process.exit(1);
  }

  const html = await res.text();
  console.log('HTML length:', html.length);

  const metaUrls = isMetaAdLibraryUrl(url) ? extractMetaAdLibraryImageUrls(html) : [];
  console.log('extractMetaAdLibraryImageUrls count:', metaUrls.length);
  metaUrls.slice(0, 15).forEach((u, i) => console.log(`  [${i + 1}]`, u));
  if (metaUrls.length > 15) console.log(`  ... and ${metaUrls.length - 15} more`);

  if (metaUrls.length === 0 && isMetaAdLibraryUrl(url)) {
    console.log(
      '\nNo CDN URLs in initial HTML — Meta often hydrates creatives in the browser. Use bulk image upload or a headless scroll (Playwright) for full coverage.',
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
