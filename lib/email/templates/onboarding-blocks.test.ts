import { describe, expect, it } from 'vitest';
import {
  findUnresolvedBlockPlaceholders,
  interpolateBlocks,
  isValidBlockArray,
  seedBlocksFromMarkdown,
  BLOCK_TYPE_LABELS,
  type OnboardingBlock,
} from './onboarding-blocks';

/**
 * Pure helpers around the OnboardingBlock JSON shape used by the rich
 * onboarding emails. Three contracts to pin:
 *
 *   1. interpolateBlocks LEAVES unresolved placeholders in place rather
 *      than replacing them with empty strings. The send-time guard relies
 *      on `findUnresolvedBlockPlaceholders` finding leftover {{tokens}}
 *      AFTER substitution to refuse a half-rendered email.
 *
 *   2. isValidBlockArray is the API boundary check. It must reject any
 *      object whose `type` is unknown OR whose required text fields are
 *      missing, so an attacker-controlled JSON body can't bypass our
 *      type-narrowing in renderBlock.
 *
 *   3. seedBlocksFromMarkdown is forgiving by design (admin paste-in
 *      from markdown drafts) but each branch maps to a specific block
 *      type. Pinning the branch table prevents an accidental fallthrough
 *      that would render hero headings as paragraphs.
 */

describe('findUnresolvedBlockPlaceholders', () => {
  it('returns [] for an empty array', () => {
    expect(findUnresolvedBlockPlaceholders([])).toEqual([]);
  });

  it('returns [] when no block contains placeholders', () => {
    const blocks: OnboardingBlock[] = [
      { type: 'hero', heading: 'Welcome', subtext: 'Glad you are here' },
      { type: 'paragraph', text: 'Plain text only.' },
      { type: 'cta', label: 'Open', url: 'https://example.com' },
      { type: 'features', items: ['One', 'Two'] },
      { type: 'callout', label: 'NOTE', text: 'Heads up.' },
      { type: 'divider' },
      { type: 'signature', text: 'The team' },
    ];
    expect(findUnresolvedBlockPlaceholders(blocks)).toEqual([]);
  });

  it('extracts placeholder keys from hero heading and subtext', () => {
    const out = findUnresolvedBlockPlaceholders([
      { type: 'hero', heading: 'Welcome {{name}}', subtext: 'From {{agency}}' },
    ]);
    expect(out.sort()).toEqual(['agency', 'name']);
  });

  it('extracts from paragraph + cta + features + callout + signature', () => {
    const out = findUnresolvedBlockPlaceholders([
      { type: 'paragraph', text: 'Hi {{first_name}}.' },
      { type: 'cta', label: '{{cta_label}}', url: 'https://x.test/{{token}}' },
      { type: 'features', items: ['Item {{a}}', 'Item {{b}}'] },
      { type: 'callout', label: '{{tag}}', text: 'See {{detail}}.' },
      { type: 'signature', text: '– {{signer}}' },
    ]);
    expect(out.sort()).toEqual(
      ['a', 'b', 'cta_label', 'detail', 'first_name', 'signer', 'tag', 'token'].sort(),
    );
  });

  it('deduplicates: a key referenced in multiple blocks is reported once', () => {
    const out = findUnresolvedBlockPlaceholders([
      { type: 'hero', heading: 'Hi {{name}}' },
      { type: 'paragraph', text: 'Welcome {{name}}.' },
      { type: 'signature', text: '– {{name}}' },
    ]);
    expect(out).toEqual(['name']);
  });

  it('ignores divider blocks (no text fields)', () => {
    const out = findUnresolvedBlockPlaceholders([
      { type: 'divider' },
      { type: 'paragraph', text: 'real {{key}}' },
    ]);
    expect(out).toEqual(['key']);
  });

  it('hero with no subtext does not crash on undefined access', () => {
    const out = findUnresolvedBlockPlaceholders([
      { type: 'hero', heading: 'Hello {{name}}' },
    ]);
    expect(out).toEqual(['name']);
  });

  it('tolerates whitespace inside the placeholder braces', () => {
    const out = findUnresolvedBlockPlaceholders([
      { type: 'paragraph', text: 'Hi {{ name }}!' },
    ]);
    expect(out).toEqual(['name']);
  });
});

describe('interpolateBlocks', () => {
  it('substitutes placeholders across every text-bearing field', () => {
    const blocks: OnboardingBlock[] = [
      { type: 'hero', heading: 'Hi {{name}}', subtext: 'From {{agency}}' },
      { type: 'paragraph', text: 'Welcome {{name}}.' },
      { type: 'cta', label: 'Open {{label}}', url: 'https://x.test/{{token}}' },
      { type: 'features', items: ['{{a}}', '{{b}}'] },
      { type: 'callout', label: '{{tag}}', text: 'See {{detail}}.' },
      { type: 'divider' },
      { type: 'signature', text: '– {{signer}}' },
    ];
    const out = interpolateBlocks(blocks, {
      name: 'Acme',
      agency: 'Nativz',
      label: 'portal',
      token: 'abc123',
      a: 'Alpha',
      b: 'Beta',
      tag: 'NOTE',
      detail: 'docs',
      signer: 'Jack',
    });

    expect(out[0]).toEqual({ type: 'hero', heading: 'Hi Acme', subtext: 'From Nativz' });
    expect(out[1]).toEqual({ type: 'paragraph', text: 'Welcome Acme.' });
    expect(out[2]).toEqual({ type: 'cta', label: 'Open portal', url: 'https://x.test/abc123' });
    expect(out[3]).toEqual({ type: 'features', items: ['Alpha', 'Beta'] });
    expect(out[4]).toEqual({ type: 'callout', label: 'NOTE', text: 'See docs.' });
    expect(out[5]).toEqual({ type: 'divider' });
    expect(out[6]).toEqual({ type: 'signature', text: '– Jack' });
  });

  it('LEAVES unresolved placeholders in place (does not blank them)', () => {
    // Critical: send-time guard scans the post-interpolation blocks for
    // leftover {{tokens}}. A regression that emptied unknown keys would
    // silently let half-rendered emails through.
    const out = interpolateBlocks(
      [{ type: 'paragraph', text: 'Hi {{name}}, your token is {{missing}}.' }],
      { name: 'Acme' },
    );
    expect(out[0]).toEqual({
      type: 'paragraph',
      text: 'Hi Acme, your token is {{missing}}.',
    });
  });

  it('preserves hero subtext absence (undefined stays undefined)', () => {
    const out = interpolateBlocks([{ type: 'hero', heading: 'Hi {{name}}' }], {
      name: 'Acme',
    });
    expect(out[0]).toEqual({ type: 'hero', heading: 'Hi Acme', subtext: undefined });
  });

  it('returns a new array (does not mutate the input blocks)', () => {
    const input: OnboardingBlock[] = [{ type: 'paragraph', text: '{{x}}' }];
    const out = interpolateBlocks(input, { x: 'y' });
    expect(input[0]).toEqual({ type: 'paragraph', text: '{{x}}' });
    expect(out[0]).toEqual({ type: 'paragraph', text: 'y' });
  });

  it('substitutes the same key multiple times in one string', () => {
    const out = interpolateBlocks(
      [{ type: 'paragraph', text: '{{name}} & {{name}} & {{name}}' }],
      { name: 'Jack' },
    );
    expect(out[0]).toEqual({ type: 'paragraph', text: 'Jack & Jack & Jack' });
  });
});

describe('isValidBlockArray', () => {
  it('accepts an empty array', () => {
    expect(isValidBlockArray([])).toBe(true);
  });

  it('rejects non-arrays', () => {
    expect(isValidBlockArray(null)).toBe(false);
    expect(isValidBlockArray(undefined)).toBe(false);
    expect(isValidBlockArray('not an array')).toBe(false);
    expect(isValidBlockArray({ type: 'paragraph', text: 'x' })).toBe(false);
    expect(isValidBlockArray(42)).toBe(false);
  });

  it('rejects an array containing a non-object element', () => {
    expect(isValidBlockArray([null])).toBe(false);
    expect(isValidBlockArray(['hero'])).toBe(false);
    expect(isValidBlockArray([42])).toBe(false);
  });

  it('rejects unknown block types', () => {
    expect(isValidBlockArray([{ type: 'mystery', text: 'x' }])).toBe(false);
    expect(isValidBlockArray([{ type: '', text: 'x' }])).toBe(false);
  });

  it('accepts a hero with optional subtext, rejects non-string heading', () => {
    expect(isValidBlockArray([{ type: 'hero', heading: 'ok' }])).toBe(true);
    expect(isValidBlockArray([{ type: 'hero', heading: 'ok', subtext: 'also ok' }])).toBe(true);
    expect(isValidBlockArray([{ type: 'hero', heading: 'ok', subtext: null }])).toBe(true);
    expect(isValidBlockArray([{ type: 'hero', heading: 42 }])).toBe(false);
    expect(isValidBlockArray([{ type: 'hero', heading: 'ok', subtext: 42 }])).toBe(false);
    expect(isValidBlockArray([{ type: 'hero' }])).toBe(false);
  });

  it('accepts paragraph and signature when text is a string', () => {
    expect(isValidBlockArray([{ type: 'paragraph', text: 'x' }])).toBe(true);
    expect(isValidBlockArray([{ type: 'signature', text: 'x' }])).toBe(true);
    expect(isValidBlockArray([{ type: 'paragraph' }])).toBe(false);
    expect(isValidBlockArray([{ type: 'signature', text: 42 }])).toBe(false);
  });

  it('accepts cta only when both label and url are strings', () => {
    expect(isValidBlockArray([{ type: 'cta', label: 'x', url: 'https://y.test' }])).toBe(true);
    expect(isValidBlockArray([{ type: 'cta', label: 'x' }])).toBe(false);
    expect(isValidBlockArray([{ type: 'cta', label: 1, url: '' }])).toBe(false);
  });

  it('accepts features only when items is an array of strings', () => {
    expect(isValidBlockArray([{ type: 'features', items: [] }])).toBe(true);
    expect(isValidBlockArray([{ type: 'features', items: ['a', 'b'] }])).toBe(true);
    expect(isValidBlockArray([{ type: 'features', items: ['a', 1] }])).toBe(false);
    expect(isValidBlockArray([{ type: 'features' }])).toBe(false);
    expect(isValidBlockArray([{ type: 'features', items: 'a,b' }])).toBe(false);
  });

  it('accepts callout when label and text are strings', () => {
    expect(isValidBlockArray([{ type: 'callout', label: 'NOTE', text: 'x' }])).toBe(true);
    expect(isValidBlockArray([{ type: 'callout', label: 'NOTE' }])).toBe(false);
    expect(isValidBlockArray([{ type: 'callout', text: 'x' }])).toBe(false);
  });

  it('accepts a bare divider (no other fields needed)', () => {
    expect(isValidBlockArray([{ type: 'divider' }])).toBe(true);
  });

  it('rejects a mixed array if any single block is invalid', () => {
    expect(
      isValidBlockArray([
        { type: 'paragraph', text: 'ok' },
        { type: 'paragraph' },
      ]),
    ).toBe(false);
  });
});

describe('BLOCK_TYPE_LABELS', () => {
  it('defines a label for every OnboardingBlock variant', () => {
    expect(Object.keys(BLOCK_TYPE_LABELS).sort()).toEqual(
      ['callout', 'cta', 'divider', 'features', 'hero', 'paragraph', 'signature'].sort(),
    );
    for (const v of Object.values(BLOCK_TYPE_LABELS)) {
      expect(typeof v).toBe('string');
      expect(v.length).toBeGreaterThan(0);
    }
  });
});

describe('seedBlocksFromMarkdown', () => {
  it('returns [] for empty / whitespace-only input', () => {
    expect(seedBlocksFromMarkdown('')).toEqual([]);
    expect(seedBlocksFromMarkdown('   \n\n   ')).toEqual([]);
  });

  it('maps a single # heading chunk to a hero block', () => {
    expect(seedBlocksFromMarkdown('# Welcome to Nativz')).toEqual([
      { type: 'hero', heading: 'Welcome to Nativz' },
    ]);
  });

  it('maps a `---` and `***` chunk to a divider', () => {
    expect(seedBlocksFromMarkdown('---')).toEqual([{ type: 'divider' }]);
    expect(seedBlocksFromMarkdown('***')).toEqual([{ type: 'divider' }]);
  });

  it('maps a standalone [label](url) chunk to a cta block', () => {
    expect(seedBlocksFromMarkdown('[Open portal](https://portal.test/abc)')).toEqual([
      { type: 'cta', label: 'Open portal', url: 'https://portal.test/abc' },
    ]);
  });

  it('does NOT promote inline links (other text on the line) to a cta', () => {
    // Inline link inside a paragraph stays as a paragraph chunk.
    const out = seedBlocksFromMarkdown('See [docs](https://x.test) for details.');
    expect(out).toEqual([
      { type: 'paragraph', text: 'See [docs](https://x.test) for details.' },
    ]);
  });

  it('maps an all-bullets chunk (- or *) to a features block', () => {
    const out = seedBlocksFromMarkdown('- One\n- Two\n* Three');
    expect(out).toEqual([{ type: 'features', items: ['One', 'Two', 'Three'] }]);
  });

  it('does NOT promote a partial-bullet chunk to features', () => {
    // Mixing prose and bullets in one chunk falls through to paragraph.
    const out = seedBlocksFromMarkdown('Intro line.\n- A bullet');
    expect(out).toEqual([{ type: 'paragraph', text: 'Intro line.\n- A bullet' }]);
  });

  it('maps a U+2013 / U+2014 leading-dash signature line to a signature block', () => {
    // Plain ASCII `-` is reserved for bullets and is intercepted by the
    // features-array branch above, so a one-line `- Jack` chunk becomes
    // a single-item features list (NOT a signature). Only the unicode
    // dashes U+2013 and U+2014 fall through to the signature regex.
    // Output is normalized to U+2013 + space + name.
    expect(seedBlocksFromMarkdown('– Jack')).toEqual([
      { type: 'signature', text: '– Jack' },
    ]);
    expect(seedBlocksFromMarkdown('— Jack')).toEqual([
      { type: 'signature', text: '– Jack' },
    ]);
  });

  it('a one-line `- Jack` becomes a single-item features block, not a signature', () => {
    // Pin the precedence: the all-bullets branch fires first for any
    // line starting with hyphen + space.
    expect(seedBlocksFromMarkdown('- Jack')).toEqual([
      { type: 'features', items: ['Jack'] },
    ]);
  });

  it('falls back to paragraph for any unmatched chunk', () => {
    expect(seedBlocksFromMarkdown('Hello world.')).toEqual([
      { type: 'paragraph', text: 'Hello world.' },
    ]);
  });

  it('splits on blank lines (>=2 newlines) and processes each chunk', () => {
    const md = [
      '# Welcome',
      '',
      'Hi there.',
      '',
      '- One',
      '- Two',
      '',
      '---',
      '',
      '[Click me](https://x.test)',
      '',
      '– Jack',
    ].join('\n');
    expect(seedBlocksFromMarkdown(md)).toEqual([
      { type: 'hero', heading: 'Welcome' },
      { type: 'paragraph', text: 'Hi there.' },
      { type: 'features', items: ['One', 'Two'] },
      { type: 'divider' },
      { type: 'cta', label: 'Click me', url: 'https://x.test' },
      { type: 'signature', text: '– Jack' },
    ]);
  });

  it('trims chunks before classifying (leading/trailing whitespace ignored)', () => {
    const md = '   # Welcome   \n\n   Hi there.   ';
    expect(seedBlocksFromMarkdown(md)).toEqual([
      { type: 'hero', heading: 'Welcome' },
      { type: 'paragraph', text: 'Hi there.' },
    ]);
  });
});
