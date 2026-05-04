import { describe, expect, it } from 'vitest';
import { isLikelyEnglish, isSourceLikelyEnglish } from './is-likely-english';

/**
 * isLikelyEnglish is the cheap pre-filter that drops non-English
 * SearXNG hits before they hit the AI pipeline. Two contracts to pin:
 *
 *   1. Fail-open. Empty/short/decoration-only inputs return true so a
 *      legitimate emoji-only caption or numeric title is never dropped.
 *      A regression to "default false" would silently empty out the
 *      short-form video grid for any client whose top sources have
 *      sparse text metadata.
 *
 *   2. The Latin-letter ratio is measured AFTER stripping whitespace,
 *      digits, punctuation, symbols, and emoji. Without that, a single
 *      English caption padded with emojis would dip below threshold
 *      and get dropped. Same for numeric content like "$2,500 / 7d".
 */

describe('isLikelyEnglish — fail-open cases', () => {
  it('returns true for null', () => {
    expect(isLikelyEnglish(null)).toBe(true);
  });

  it('returns true for undefined', () => {
    expect(isLikelyEnglish(undefined)).toBe(true);
  });

  it('returns true for empty string', () => {
    expect(isLikelyEnglish('')).toBe(true);
  });

  it('returns true for very short strings (post-strip below minLength)', () => {
    expect(isLikelyEnglish('hi')).toBe(true);
    expect(isLikelyEnglish('cat')).toBe(true);
  });

  it('returns true for emoji-only / punctuation-only / digits-only inputs', () => {
    expect(isLikelyEnglish('🚀🚀🚀🚀🚀')).toBe(true);
    expect(isLikelyEnglish('!!! ??? ...')).toBe(true);
    expect(isLikelyEnglish('1234567890')).toBe(true);
  });
});

describe('isLikelyEnglish — Latin-script positive cases', () => {
  it('returns true for plain English text', () => {
    expect(isLikelyEnglish('this is a regular english caption')).toBe(true);
  });

  it('returns true for English text padded with emoji and digits', () => {
    expect(isLikelyEnglish('top 5 protein shakes 🚀🥤🔥 in 2026')).toBe(true);
  });

  it('counts extended Latin (accented chars) as Latin script', () => {
    // À..ɏ covers café / naïve / résumé etc.
    expect(isLikelyEnglish('café société résumé naïve')).toBe(true);
  });

  it('returns true for English with minor non-Latin sprinkles when ratio still >= 0.6', () => {
    expect(isLikelyEnglish('hello world 你好')).toBe(true);
  });
});

describe('isLikelyEnglish — non-Latin negative cases', () => {
  it('returns false for primarily Chinese text', () => {
    expect(isLikelyEnglish('这是一个中文标题示例文字内容')).toBe(false);
  });

  it('returns false for primarily Japanese text', () => {
    expect(isLikelyEnglish('これは日本語のタイトルの例です')).toBe(false);
  });

  it('returns false for primarily Cyrillic text', () => {
    expect(isLikelyEnglish('Это пример русского заголовка')).toBe(false);
  });

  it('returns false for primarily Arabic text', () => {
    expect(isLikelyEnglish('هذا مثال على عنوان عربي طويل')).toBe(false);
  });

  it('returns false for mixed Latin+Chinese where Latin is below the 0.6 threshold', () => {
    expect(isLikelyEnglish('ok 这是一段中文很长的内容更多文字')).toBe(false);
  });
});

describe('isLikelyEnglish — option overrides', () => {
  it('honours a stricter minLatinRatio', () => {
    // ~50% Latin -> default 0.6 fails, but 0.4 passes.
    const txt = 'abcd 这些 efgh';
    expect(isLikelyEnglish(txt, { minLatinRatio: 0.4 })).toBe(true);
    expect(isLikelyEnglish(txt, { minLatinRatio: 0.95 })).toBe(false);
  });

  it('honours a custom minLength so longer strings are still evaluated', () => {
    // "abc" strips to 3 chars -> default minLength 4 means fail-open.
    // Lowering minLength to 2 makes it actually evaluate the ratio.
    expect(isLikelyEnglish('abc', { minLength: 2 })).toBe(true);
    expect(isLikelyEnglish('日本', { minLength: 2 })).toBe(false);
  });
});

describe('isSourceLikelyEnglish', () => {
  it('joins title + content before evaluating', () => {
    expect(
      isSourceLikelyEnglish({
        title: 'best protein',
        content: 'shakes for 2026',
      }),
    ).toBe(true);
  });

  it('skips nullish fields when joining', () => {
    expect(
      isSourceLikelyEnglish({ title: null, content: 'this is english content' }),
    ).toBe(true);
    expect(
      isSourceLikelyEnglish({ title: 'this is english content', content: null }),
    ).toBe(true);
  });

  it('returns false when the joined text is primarily non-Latin', () => {
    expect(
      isSourceLikelyEnglish({
        title: '中文标题',
        content: '这是一段中文的描述内容',
      }),
    ).toBe(false);
  });

  it('returns true (fail-open) when both fields are null/empty', () => {
    expect(isSourceLikelyEnglish({ title: null, content: null })).toBe(true);
    expect(isSourceLikelyEnglish({})).toBe(true);
  });
});
