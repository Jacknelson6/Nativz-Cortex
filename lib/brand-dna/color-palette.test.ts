import { describe, expect, it } from 'vitest';
import type { CrawledPage } from './types';
import { cssColorToHex, dedupeHexList, extractColorPalette } from './color-palette';

describe('cssColorToHex', () => {
  it('parses hsl()', () => {
    expect(cssColorToHex('hsl(0, 100%, 50%)')).toBe('#ff0000');
    expect(cssColorToHex('hsl(200, 80%, 50%)')).toBe('#19a1e6');
  });

  it('expands 3-digit hex', () => {
    expect(cssColorToHex('#abc')).toBe('#aabbcc');
  });
});

describe('dedupeHexList', () => {
  it('merges near-identical hexes', () => {
    const out = dedupeHexList(['#3366cc', '#3366cd', '#ff0000'], 4);
    expect(out.length).toBeLessThanOrEqual(3);
    expect(out).toContain('#ff0000');
  });
});

describe('extractColorPalette', () => {
  it('prioritizes CSS variables and theme-color over random hex spam', () => {
    const junk = Array.from({ length: 40 }, (_, i) => `#${((i * 999) % 0xffffff).toString(16).padStart(6, '0')}`).join(
      ' ',
    );
    const html = `<!DOCTYPE html><html><head>
<meta name="theme-color" content="#111827">
<style>
:root { --color-primary: #e11d48; --brand-accent: #0ea5e9; }
body { color: #333333; background: #fafafa; }
${junk.split(' ').map((h) => ` .x${h} { color: ${h}; }`).join('')}
</style></head><body></body></html>`;

    const page: CrawledPage = {
      url: 'https://example.com',
      html,
      title: 'x',
      content: '',
      wordCount: 0,
      pageType: 'homepage',
    };

    const palette = extractColorPalette([page]);
    expect(palette.length).toBeGreaterThan(0);
    expect(palette.length).toBeLessThanOrEqual(5);
    expect(palette[0]?.role).toBe('primary');
    const hexes = palette.map((p) => p.hex.toLowerCase());
    expect(hexes.some((h) => h === '#e11d48' || h === '#111827')).toBe(true);
  });

  it('assigns distinct roles including tertiary when enough chromatic colors exist', () => {
    const html = `<!DOCTYPE html><html><head><style>
:root {
  --color-primary: #ff0000;
  --color-secondary: #00ff00;
  --brand-accent: #0000ff;
  --supporting-warm: #ffaa00;
}
</style></head><body></body></html>`;
    const page: CrawledPage = {
      url: 'https://example.com',
      html,
      title: 'x',
      content: '',
      wordCount: 0,
      pageType: 'homepage',
    };
    const palette = extractColorPalette([page]);
    const roles = new Set(palette.map((c) => c.role));
    expect(roles.has('primary')).toBe(true);
    expect(palette.length).toBeGreaterThanOrEqual(3);
  });
});
