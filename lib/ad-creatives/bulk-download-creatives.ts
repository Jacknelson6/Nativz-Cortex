import JSZip from 'jszip';
import type { AdCreative } from './types';

/**
 * Fetches selected creative images and triggers a single .zip download in the browser.
 * Skips entries that fail to fetch (e.g. CORS or network) and still produces a zip when any succeed.
 */
export async function downloadCreativesAsZip(
  creatives: AdCreative[],
  zipBasename: string,
): Promise<{ added: number; skipped: number }> {
  const zip = new JSZip();
  let added = 0;
  let skipped = 0;

  await Promise.all(
    creatives.map(async (c) => {
      try {
        const res = await fetch(c.image_url);
        if (!res.ok) {
          skipped++;
          return;
        }
        const buf = await res.arrayBuffer();
        zip.file(`creative-${c.id}.png`, buf);
        added++;
      } catch {
        skipped++;
      }
    }),
  );

  if (added === 0) {
    throw new Error('No images could be downloaded. Check your connection or try again.');
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const safeName = zipBasename.replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 80) || 'ad-creatives';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName}.zip`;
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return { added, skipped };
}
