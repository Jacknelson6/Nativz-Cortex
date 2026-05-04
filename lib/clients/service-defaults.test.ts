import { describe, expect, it } from 'vitest';
import {
  SERVICE_DEFAULT_MONTHLY,
  clientHasService,
  normalizeServiceLabel,
} from './service-defaults';

describe('SERVICE_DEFAULT_MONTHLY', () => {
  it('matches the contract documented in the capacity PRD', () => {
    expect(SERVICE_DEFAULT_MONTHLY).toEqual({ editing: 0, smm: 60, blogging: 0 });
  });
});

describe('normalizeServiceLabel', () => {
  it('returns null for nullish input', () => {
    expect(normalizeServiceLabel(null)).toBeNull();
    expect(normalizeServiceLabel(undefined)).toBeNull();
    expect(normalizeServiceLabel('')).toBeNull();
  });

  it('matches each known kind', () => {
    expect(normalizeServiceLabel('editing')).toBe('editing');
    expect(normalizeServiceLabel('smm')).toBe('smm');
    expect(normalizeServiceLabel('blogging')).toBe('blogging');
  });

  it('matches case-insensitively', () => {
    expect(normalizeServiceLabel('Editing')).toBe('editing');
    expect(normalizeServiceLabel('SMM')).toBe('smm');
    expect(normalizeServiceLabel('Blogging')).toBe('blogging');
  });

  it('trims surrounding whitespace before matching', () => {
    expect(normalizeServiceLabel('  editing  ')).toBe('editing');
  });

  it('returns null for unknown labels', () => {
    expect(normalizeServiceLabel('podcasting')).toBeNull();
    expect(normalizeServiceLabel('edit')).toBeNull();
    expect(normalizeServiceLabel('social')).toBeNull();
  });
});

describe('clientHasService', () => {
  it('returns false when services is null/undefined/empty', () => {
    expect(clientHasService(null, 'editing')).toBe(false);
    expect(clientHasService(undefined, 'editing')).toBe(false);
    expect(clientHasService([], 'editing')).toBe(false);
  });

  it('returns true when the kind is present', () => {
    expect(clientHasService(['Editing'], 'editing')).toBe(true);
    expect(clientHasService(['SMM', 'Blogging'], 'smm')).toBe(true);
  });

  it('returns false when the kind is missing', () => {
    expect(clientHasService(['SMM'], 'editing')).toBe(false);
  });

  it('matches case-insensitively across the array', () => {
    expect(clientHasService(['  blogging  ', 'EDITING'], 'editing')).toBe(true);
  });

  it('ignores unknown labels in the services array', () => {
    expect(clientHasService(['podcasting', 'editing'], 'editing')).toBe(true);
    expect(clientHasService(['podcasting'], 'editing')).toBe(false);
  });
});
