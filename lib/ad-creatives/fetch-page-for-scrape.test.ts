import { describe, expect, it } from 'vitest';
import { isLikelyJsShellDocument } from './fetch-page-for-scrape';

describe('isLikelyJsShellDocument', () => {
  it('returns false for HTML with substantial text', () => {
    const html = `<!DOCTYPE html><html><body><main><p>${'word '.repeat(200)}</p></main></body></html>`;
    expect(isLikelyJsShellDocument(html)).toBe(false);
  });

  it('returns true for empty root-style SPA shell', () => {
    const html =
      '<!DOCTYPE html><html><body><div id="root"></div><script src="/app.js"></script></body></html>';
    expect(isLikelyJsShellDocument(html)).toBe(true);
  });
});
