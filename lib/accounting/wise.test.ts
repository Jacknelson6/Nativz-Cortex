import { describe, expect, it } from 'vitest';
import {
  appendWiseSuffix,
  extractWiseUrl,
  formatWiseSuffix,
  isLikelyWiseUrl,
} from './wise';

const WISE_URL = 'https://wise.com/pay/r/abc123';

describe('extractWiseUrl', () => {
  it('returns null for nullish input', () => {
    expect(extractWiseUrl(null)).toBeNull();
    expect(extractWiseUrl(undefined)).toBeNull();
    expect(extractWiseUrl('')).toBeNull();
  });

  it('returns null when no Wise line is present', () => {
    expect(extractWiseUrl('Just a normal description')).toBeNull();
  });

  it('extracts a URL on its own line', () => {
    expect(extractWiseUrl(`Wise: ${WISE_URL}`)).toBe(WISE_URL);
  });

  it('extracts a URL embedded after other description text', () => {
    const desc = `Edited 5 reels for the May campaign\n\nWise: ${WISE_URL}`;
    expect(extractWiseUrl(desc)).toBe(WISE_URL);
  });

  it('matches the prefix case-insensitively', () => {
    expect(extractWiseUrl(`WISE: ${WISE_URL}`)).toBe(WISE_URL);
    expect(extractWiseUrl(`wise: ${WISE_URL}`)).toBe(WISE_URL);
  });

  it('rejects values without an http(s) protocol', () => {
    expect(extractWiseUrl('Wise: wise.com/pay/r/abc')).toBeNull();
    expect(extractWiseUrl('Wise: ftp://wise.com/x')).toBeNull();
  });

  it('accepts http:// as well as https://', () => {
    expect(extractWiseUrl('Wise: http://wise.com/pay/x')).toBe('http://wise.com/pay/x');
  });

  it('returns the first Wise URL when several are present', () => {
    const desc = `Wise: ${WISE_URL}\nWise: https://wise.com/other`;
    expect(extractWiseUrl(desc)).toBe(WISE_URL);
  });
});

describe('formatWiseSuffix', () => {
  it('produces the canonical "Wise: <url>" string', () => {
    expect(formatWiseSuffix(WISE_URL)).toBe(`Wise: ${WISE_URL}`);
  });

  it('trims surrounding whitespace from the URL', () => {
    expect(formatWiseSuffix(`  ${WISE_URL}  `)).toBe(`Wise: ${WISE_URL}`);
  });
});

describe('appendWiseSuffix', () => {
  it('returns just the suffix when the description is empty', () => {
    expect(appendWiseSuffix(null, WISE_URL)).toBe(`Wise: ${WISE_URL}`);
    expect(appendWiseSuffix('', WISE_URL)).toBe(`Wise: ${WISE_URL}`);
    expect(appendWiseSuffix('   ', WISE_URL)).toBe(`Wise: ${WISE_URL}`);
  });

  it('appends a blank-line-separated suffix to existing text', () => {
    expect(appendWiseSuffix('Edited 5 reels', WISE_URL)).toBe(
      `Edited 5 reels\n\nWise: ${WISE_URL}`,
    );
  });

  it('is idempotent when the description already carries a Wise URL', () => {
    const existing = `Edited 5 reels\n\nWise: ${WISE_URL}`;
    expect(appendWiseSuffix(existing, 'https://wise.com/different')).toBe(existing);
  });

  it('trims the description before appending so trailing whitespace does not stack', () => {
    expect(appendWiseSuffix('Edited 5 reels   \n', WISE_URL)).toBe(
      `Edited 5 reels\n\nWise: ${WISE_URL}`,
    );
  });
});

describe('isLikelyWiseUrl', () => {
  it('accepts canonical wise.com URLs', () => {
    expect(isLikelyWiseUrl('https://wise.com/pay/r/abc')).toBe(true);
    expect(isLikelyWiseUrl('http://wise.com/x')).toBe(true);
  });

  it('accepts the www variant', () => {
    expect(isLikelyWiseUrl('https://www.wise.com/pay/r/abc')).toBe(true);
  });

  it('rejects empty or whitespace-only input', () => {
    expect(isLikelyWiseUrl('')).toBe(false);
    expect(isLikelyWiseUrl('   ')).toBe(false);
  });

  it('rejects unrelated domains and freeform text', () => {
    expect(isLikelyWiseUrl('https://example.com/pay')).toBe(false);
    expect(isLikelyWiseUrl('wise.com/pay/r/abc')).toBe(false);
    expect(isLikelyWiseUrl('not a url')).toBe(false);
  });

  it('tolerates leading/trailing whitespace', () => {
    expect(isLikelyWiseUrl('  https://wise.com/pay/r/abc  ')).toBe(true);
  });
});
