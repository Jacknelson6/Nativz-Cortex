import { describe, expect, it } from 'vitest';
import {
  SCREENS,
  totalScreens,
  screenAt,
  doneIndex,
  isDoneStep,
} from './screens';

/**
 * screens.ts is the single source of truth for the onboarding stepper:
 * which screens exist for each kind ('smm' | 'editing'), their order,
 * the step_state JSONB key each owns, and which index is terminal.
 *
 * The whole stepper UI walks SCREENS[kind][current_step] and the admin
 * tracker reads `label` for progress copy. A reordering or off-by-one
 * here breaks every in-flight onboarding because `current_step` is just
 * a stored integer index.
 *
 * These tests pin the contract so a refactor (or an "oops, dropped a
 * screen" mistake) gets caught on commit.
 */

describe('SCREENS — structural invariants', () => {
  it('has both kinds defined', () => {
    expect(SCREENS).toHaveProperty('smm');
    expect(SCREENS).toHaveProperty('editing');
  });

  it('every screen has a non-empty key + label', () => {
    for (const kind of ['smm', 'editing'] as const) {
      for (const screen of SCREENS[kind]) {
        expect(typeof screen.key).toBe('string');
        expect(screen.key.length).toBeGreaterThan(0);
        expect(typeof screen.label).toBe('string');
        expect(screen.label.length).toBeGreaterThan(0);
      }
    }
  });

  it('has unique keys within each kind', () => {
    for (const kind of ['smm', 'editing'] as const) {
      const keys = SCREENS[kind].map((s) => s.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('first screen is "welcome" and last screen is "done" for every kind', () => {
    for (const kind of ['smm', 'editing'] as const) {
      const list = SCREENS[kind];
      expect(list[0].key).toBe('welcome');
      expect(list[list.length - 1].key).toBe('done');
    }
  });

  it('welcome and done screens own no step_state slot', () => {
    for (const kind of ['smm', 'editing'] as const) {
      const list = SCREENS[kind];
      expect(list[0].step_state_key).toBeNull();
      expect(list[list.length - 1].step_state_key).toBeNull();
    }
  });
});

describe('SCREENS — SMM screen order (drives milestones)', () => {
  it('matches the canonical 7-step SMM flow', () => {
    expect(SCREENS.smm.map((s) => s.key)).toEqual([
      'welcome',
      'brand_basics',
      'social_connect',
      'content_prefs',
      'audience_tone',
      'kickoff_pick',
      'done',
    ]);
  });

  it('places social_connect at index 2 (milestone fires when current_step crosses 2 to 3)', () => {
    expect(SCREENS.smm[2].key).toBe('social_connect');
  });

  it('places kickoff_pick at index 5 (milestone fires when current_step crosses 5 to 6)', () => {
    expect(SCREENS.smm[5].key).toBe('kickoff_pick');
  });
});

describe('SCREENS — Editing screen order (drives milestones)', () => {
  it('matches the canonical 5-step editing flow', () => {
    expect(SCREENS.editing.map((s) => s.key)).toEqual([
      'welcome',
      'project_brief',
      'asset_link',
      'turnaround_ack',
      'done',
    ]);
  });

  it('places asset_link at index 2 (milestone fires when current_step crosses 2 to 3)', () => {
    expect(SCREENS.editing[2].key).toBe('asset_link');
  });
});

describe('totalScreens', () => {
  it('returns 7 for smm', () => {
    expect(totalScreens('smm')).toBe(7);
  });

  it('returns 5 for editing', () => {
    expect(totalScreens('editing')).toBe(5);
  });
});

describe('screenAt', () => {
  it('returns the screen at a valid index', () => {
    expect(screenAt('smm', 0)?.key).toBe('welcome');
    expect(screenAt('smm', 5)?.key).toBe('kickoff_pick');
    expect(screenAt('editing', 2)?.key).toBe('asset_link');
  });

  it('returns null for negative indices', () => {
    expect(screenAt('smm', -1)).toBeNull();
    expect(screenAt('editing', -42)).toBeNull();
  });

  it('returns null for out-of-bounds indices', () => {
    expect(screenAt('smm', 7)).toBeNull();
    expect(screenAt('smm', 999)).toBeNull();
    expect(screenAt('editing', 5)).toBeNull();
  });
});

describe('doneIndex', () => {
  it('returns the last index for smm (6)', () => {
    expect(doneIndex('smm')).toBe(6);
  });

  it('returns the last index for editing (4)', () => {
    expect(doneIndex('editing')).toBe(4);
  });

  it('lands on the screen with key "done"', () => {
    expect(SCREENS.smm[doneIndex('smm')].key).toBe('done');
    expect(SCREENS.editing[doneIndex('editing')].key).toBe('done');
  });
});

describe('isDoneStep', () => {
  it('returns true only on the terminal index', () => {
    expect(isDoneStep('smm', 6)).toBe(true);
    expect(isDoneStep('editing', 4)).toBe(true);
  });

  it('returns false on every other index', () => {
    expect(isDoneStep('smm', 0)).toBe(false);
    expect(isDoneStep('smm', 5)).toBe(false);
    expect(isDoneStep('editing', 0)).toBe(false);
    expect(isDoneStep('editing', 3)).toBe(false);
  });

  it('returns false on out-of-bounds indices (defensive)', () => {
    expect(isDoneStep('smm', 7)).toBe(false);
    expect(isDoneStep('smm', -1)).toBe(false);
  });
});
