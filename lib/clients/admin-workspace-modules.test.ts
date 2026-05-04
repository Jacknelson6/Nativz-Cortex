import { describe, expect, it } from 'vitest';
import {
  ADMIN_WORKSPACE_TOGGLE_KEYS,
  isAdminWorkspaceNavVisible,
  normalizeAdminWorkspaceModules,
  parseFullAdminWorkspaceModulesForPatch,
} from './admin-workspace-modules';

describe('isAdminWorkspaceNavVisible', () => {
  it('always returns true for overview and settings', () => {
    expect(isAdminWorkspaceNavVisible({ overview: false, settings: false }, 'overview')).toBe(true);
    expect(isAdminWorkspaceNavVisible({ overview: false, settings: false }, 'settings')).toBe(true);
  });

  it('returns true when modules map is null/undefined (default-allow)', () => {
    expect(isAdminWorkspaceNavVisible(null, 'brand-dna')).toBe(true);
    expect(isAdminWorkspaceNavVisible(undefined, 'brand-dna')).toBe(true);
  });

  it('returns true when modules map is not an object', () => {
    expect(isAdminWorkspaceNavVisible('not-an-object' as unknown as Record<string, boolean>, 'brand-dna')).toBe(true);
  });

  it('returns false only when the key is explicitly false', () => {
    expect(isAdminWorkspaceNavVisible({ 'brand-dna': false }, 'brand-dna')).toBe(false);
  });

  it('returns true when the key is true', () => {
    expect(isAdminWorkspaceNavVisible({ 'brand-dna': true }, 'brand-dna')).toBe(true);
  });

  it('returns true when the key is missing from the map (default-allow)', () => {
    expect(isAdminWorkspaceNavVisible({ moodboard: false }, 'brand-dna')).toBe(true);
  });
});

describe('normalizeAdminWorkspaceModules', () => {
  it('defaults every toggle key to true when raw is null/undefined', () => {
    const result = normalizeAdminWorkspaceModules(null);
    for (const key of ADMIN_WORKSPACE_TOGGLE_KEYS) {
      expect(result[key]).toBe(true);
    }
  });

  it('defaults every toggle key to true when raw is not an object', () => {
    expect(normalizeAdminWorkspaceModules('nope')).toEqual({
      'brand-dna': true,
      moodboard: true,
      knowledge: true,
      'ad-creatives': true,
      contract: true,
    });
  });

  it('overrides defaults with explicit boolean values', () => {
    const result = normalizeAdminWorkspaceModules({ 'brand-dna': false, knowledge: false });
    expect(result['brand-dna']).toBe(false);
    expect(result.knowledge).toBe(false);
    expect(result.moodboard).toBe(true); // default-allow for missing keys
  });

  it('ignores non-boolean values (string/number/null) and keeps default true', () => {
    const result = normalizeAdminWorkspaceModules({
      'brand-dna': 'false',
      moodboard: 0,
      knowledge: null,
    });
    expect(result['brand-dna']).toBe(true);
    expect(result.moodboard).toBe(true);
    expect(result.knowledge).toBe(true);
  });

  it('ignores unknown keys without throwing', () => {
    const result = normalizeAdminWorkspaceModules({ 'brand-dna': false, mystery: true });
    expect(result['brand-dna']).toBe(false);
    expect((result as Record<string, boolean>).mystery).toBeUndefined();
  });
});

describe('parseFullAdminWorkspaceModulesForPatch', () => {
  const fullPayload = {
    'brand-dna': true,
    moodboard: false,
    knowledge: true,
    'ad-creatives': false,
    contract: true,
  };

  it('returns the normalized payload when all toggle keys are booleans', () => {
    expect(parseFullAdminWorkspaceModulesForPatch(fullPayload)).toEqual(fullPayload);
  });

  it('rejects null/undefined', () => {
    expect(parseFullAdminWorkspaceModulesForPatch(null)).toBeNull();
    expect(parseFullAdminWorkspaceModulesForPatch(undefined)).toBeNull();
  });

  it('rejects non-objects', () => {
    expect(parseFullAdminWorkspaceModulesForPatch('hello')).toBeNull();
    expect(parseFullAdminWorkspaceModulesForPatch(42)).toBeNull();
  });

  it('rejects arrays', () => {
    expect(parseFullAdminWorkspaceModulesForPatch([true, false])).toBeNull();
  });

  it('rejects when any toggle key is missing', () => {
    const partial = { ...fullPayload } as Record<string, unknown>;
    delete partial.knowledge;
    expect(parseFullAdminWorkspaceModulesForPatch(partial)).toBeNull();
  });

  it('rejects when any toggle key has a non-boolean value', () => {
    expect(
      parseFullAdminWorkspaceModulesForPatch({ ...fullPayload, knowledge: 'true' }),
    ).toBeNull();
    expect(
      parseFullAdminWorkspaceModulesForPatch({ ...fullPayload, contract: 1 }),
    ).toBeNull();
  });

  it('strips unknown extras when normalizing the patch payload', () => {
    const result = parseFullAdminWorkspaceModulesForPatch({ ...fullPayload, extra: true });
    expect(result).toEqual(fullPayload);
  });
});
