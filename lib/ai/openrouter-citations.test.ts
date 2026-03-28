import { describe, expect, it } from 'vitest';
import { extractOpenRouterWebCitations, extractUrlsFromPlainText } from './openrouter-citations';

describe('extractOpenRouterWebCitations', () => {
  it('parses url_citation annotations from OpenRouter-shaped responses', () => {
    const data = {
      choices: [
        {
          message: {
            content: 'Summary text.',
            annotations: [
              {
                type: 'url_citation',
                url_citation: {
                  url: 'https://example.com/page',
                  title: 'Example page',
                  content: 'Snippet from the page.',
                },
              },
            ],
          },
        },
      ],
    };
    const out = extractOpenRouterWebCitations(data as Record<string, unknown>);
    expect(out).toHaveLength(1);
    expect(out[0].url).toContain('example.com');
    expect(out[0].title).toBe('Example page');
    expect(out[0].snippet).toContain('Snippet');
  });
});

describe('extractUrlsFromPlainText', () => {
  it('dedupes URLs from prose', () => {
    const text = 'See https://a.com/x and also https://a.com/x again.';
    const out = extractUrlsFromPlainText(text, 5);
    expect(out.length).toBe(1);
    expect(out[0].url).toContain('a.com');
  });
});
