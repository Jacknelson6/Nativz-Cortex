import { describe, expect, it } from 'vitest';
import {
  getClientAbbreviationLabel,
  normalizeClientNameKey,
} from './client-abbreviations';

describe('normalizeClientNameKey', () => {
  it('lowercases', () => {
    expect(normalizeClientNameKey('Goodier Labs')).toBe('goodier labs');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeClientNameKey('  Hartley Law  ')).toBe('hartley law');
  });

  it('collapses internal whitespace runs', () => {
    expect(normalizeClientNameKey('Total   Plumbing')).toBe('total plumbing');
  });

  it('preserves apostrophes and other punctuation', () => {
    expect(normalizeClientNameKey("Dunston's Steakhouse")).toBe("dunston's steakhouse");
  });
});

describe('getClientAbbreviationLabel', () => {
  it('returns the curated abbreviation when the name matches', () => {
    expect(getClientAbbreviationLabel('Goodier Labs')).toBe('GL');
    expect(getClientAbbreviationLabel('All Shutters and Blinds')).toBe('ASAB');
  });

  it('matches name case-insensitively + whitespace-tolerant', () => {
    expect(getClientAbbreviationLabel('  GOODIER  LABS  ')).toBe('GL');
  });

  it("respects names with apostrophes", () => {
    expect(getClientAbbreviationLabel("Dunston's Steakhouse")).toBe('DSH');
  });

  it('falls back to slug when the name does not match but the slug is curated', () => {
    expect(getClientAbbreviationLabel('Some Renamed Display', 'safe-stop')).toBe('SS');
    expect(getClientAbbreviationLabel('College Hunks', 'college-hunks-hauling-junk')).toBe('CHHJ');
  });

  it('matches slug case-insensitively + whitespace-tolerant', () => {
    expect(getClientAbbreviationLabel('Anything', '  Safe-Stop  ')).toBe('SS');
  });

  it('prefers the name match over a slug match when both exist', () => {
    // Goldback is curated under both maps; the name-keyed value wins.
    expect(getClientAbbreviationLabel('Goldback', 'goldback')).toBe('GB');
  });

  it('returns the original name when neither name nor slug is curated', () => {
    expect(getClientAbbreviationLabel('Acme Industries', 'acme-industries')).toBe(
      'Acme Industries',
    );
  });

  it('returns the original name when no slug is provided and the name is unknown', () => {
    expect(getClientAbbreviationLabel('Acme Industries')).toBe('Acme Industries');
  });

  it('handles an empty/null slug without crashing', () => {
    expect(getClientAbbreviationLabel('Acme Industries', null)).toBe('Acme Industries');
    expect(getClientAbbreviationLabel('Acme Industries', '')).toBe('Acme Industries');
  });
});
