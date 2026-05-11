import { describe, expect, it, vi } from 'vitest';

/**
 * detectMilestones is the pure decision function that decides whether a
 * given onboarding PATCH (prev -> next) is admin-notification worthy.
 *
 * The choke point is /api/public/onboarding/[token] PATCH. Every screen
 * save flows through it, so this function MUST stay quiet for ordinary
 * progress and ONLY fire on the documented milestone transitions:
 *
 *   SMM (5 screens: welcome=0, brand_basics=1, social_connect=2,
 *        points_of_contact=3, done=4):
 *     - cross social_connect    (current_step 2 -> 3)
 *     - cross points_of_contact (current_step 3 -> 4)
 *
 *   Editing (4 screens: welcome=0, brand_basics=1,
 *            footage_and_references=2, done=3):
 *     - cross footage_and_references (current_step 2 -> 3)
 *
 *   Either kind:
 *     - status: in_progress -> completed (suppresses all per-step
 *       milestones in the same transition; the completion email is the
 *       headline event)
 *
 * Re-fires (back nav, no-op saves, status flip away from completed) MUST
 * NOT trigger any notification, otherwise admins get spammed.
 */

vi.mock('@/lib/notifications', () => ({
  notifyAdmins: vi.fn(async () => {}),
}));
vi.mock('./email', () => ({
  sendOnboardingCompleteEmail: vi.fn(async () => []),
  sendOnboardingOpsHandoffEmail: vi.fn(async () => ({})),
}));
vi.mock('./api', () => ({
  logEmail: vi.fn(async () => {}),
}));

const { detectMilestones } = await import('./milestones');

import type { OnboardingRow } from './types';

function makeRow(overrides: Partial<OnboardingRow> = {}): OnboardingRow {
  return {
    id: 'ob-1',
    client_id: 'c-1',
    kind: 'smm',
    platforms: [],
    current_step: 0,
    share_token: 'tok',
    step_state: {},
    status: 'in_progress',
    started_at: '2026-01-01T00:00:00Z',
    completed_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    admin_step_overrides: {},
    completion_requirements: {},
    ...overrides,
  };
}

describe('detectMilestones — no-op transitions', () => {
  it('returns [] when nothing changed', () => {
    const row = makeRow({ current_step: 3 });
    expect(detectMilestones(row, row, 'Acme')).toEqual([]);
  });

  it('returns [] for back nav (current_step decreased)', () => {
    const prev = makeRow({ current_step: 4 });
    const next = makeRow({ current_step: 2 });
    expect(detectMilestones(prev, next, 'Acme')).toEqual([]);
  });

  it('returns [] for advancing through brand_basics (welcome -> brand_basics)', () => {
    const prev = makeRow({ current_step: 0 });
    const next = makeRow({ current_step: 1 });
    expect(detectMilestones(prev, next, 'Acme')).toEqual([]);
  });

  it('returns [] for advancing brand_basics -> social_connect (1 -> 2)', () => {
    const prev = makeRow({ current_step: 1 });
    const next = makeRow({ current_step: 2 });
    expect(detectMilestones(prev, next, 'Acme')).toEqual([]);
  });

  it('returns [] when status flips away from completed (defensive: shouldnt happen)', () => {
    const prev = makeRow({ status: 'completed', current_step: 4 });
    const next = makeRow({ status: 'in_progress', current_step: 4 });
    expect(detectMilestones(prev, next, 'Acme')).toEqual([]);
  });

  it('returns [] when status was already completed and stays completed', () => {
    const prev = makeRow({ status: 'completed', current_step: 4 });
    const next = makeRow({ status: 'completed', current_step: 4 });
    expect(detectMilestones(prev, next, 'Acme')).toEqual([]);
  });
});

describe('detectMilestones — SMM milestones', () => {
  it('fires "connected socials" when current_step crosses 2 to 3', () => {
    const prev = makeRow({ kind: 'smm', current_step: 2 });
    const next = makeRow({ kind: 'smm', current_step: 3 });
    const out = detectMilestones(prev, next, 'Acme');
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('Acme connected their social accounts');
    expect(out[0].body).toMatch(/Zernio/);
  });

  it('fires "added points of contact" when current_step crosses 3 to 4', () => {
    const prev = makeRow({ kind: 'smm', current_step: 3 });
    const next = makeRow({ kind: 'smm', current_step: 4 });
    const out = detectMilestones(prev, next, 'Acme');
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('Acme added points of contact');
  });

  it('fires both SMM milestones when a single PATCH crosses several screens', () => {
    // Edge case: stepper issues advance_to + complete in a single PATCH.
    // current_step jumps from 2 to 4. Walk visits screens 2 and 3,
    // emitting both milestones.
    const prev = makeRow({ kind: 'smm', current_step: 2 });
    const next = makeRow({ kind: 'smm', current_step: 4 });
    const out = detectMilestones(prev, next, 'Acme');
    expect(out.map((m) => m.title)).toEqual([
      'Acme connected their social accounts',
      'Acme added points of contact',
    ]);
  });

  it('does NOT fire SMM step milestones for the editing kind on the same indices', () => {
    const prev = makeRow({ kind: 'editing', current_step: 3 });
    const next = makeRow({ kind: 'editing', current_step: 4 });
    expect(detectMilestones(prev, next, 'Acme')).toEqual([]);
  });
});

describe('detectMilestones — Editing milestones', () => {
  it('fires "shared footage and references" when current_step crosses 2 to 3', () => {
    const prev = makeRow({ kind: 'editing', current_step: 2 });
    const next = makeRow({ kind: 'editing', current_step: 3 });
    const out = detectMilestones(prev, next, 'Acme');
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('Acme shared footage and references');
    expect(out[0].body).toMatch(/footage/i);
  });

  it('does NOT fire on welcome -> brand_basics or brand_basics -> footage transitions', () => {
    expect(
      detectMilestones(
        makeRow({ kind: 'editing', current_step: 0 }),
        makeRow({ kind: 'editing', current_step: 1 }),
        'Acme',
      ),
    ).toEqual([]);
    expect(
      detectMilestones(
        makeRow({ kind: 'editing', current_step: 1 }),
        makeRow({ kind: 'editing', current_step: 2 }),
        'Acme',
      ),
    ).toEqual([]);
  });
});

describe('detectMilestones — completion', () => {
  it('fires "finished onboarding" with SMM body when status flips to completed', () => {
    const prev = makeRow({ kind: 'smm', status: 'in_progress', current_step: 4 });
    const next = makeRow({ kind: 'smm', status: 'completed', current_step: 4 });
    const out = detectMilestones(prev, next, 'Acme');
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('Acme finished onboarding');
    expect(out[0].body).toMatch(/Brand basics/);
  });

  it('fires "finished onboarding" with editing body when status flips on editing kind', () => {
    const prev = makeRow({ kind: 'editing', status: 'in_progress', current_step: 3 });
    const next = makeRow({ kind: 'editing', status: 'completed', current_step: 3 });
    const out = detectMilestones(prev, next, 'Acme');
    expect(out).toHaveLength(1);
    expect(out[0].body).toMatch(/footage/i);
  });

  it('suppresses per-step milestones in the same transition that completes', () => {
    // Defensive: even if step bumped AND status flipped, we only announce
    // the completion to keep the inbox clean.
    const prev = makeRow({ kind: 'smm', status: 'in_progress', current_step: 3 });
    const next = makeRow({ kind: 'smm', status: 'completed', current_step: 4 });
    const out = detectMilestones(prev, next, 'Acme');
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('Acme finished onboarding');
  });
});

describe('detectMilestones — client label fallback', () => {
  it('falls back to "A client" when name is null', () => {
    const prev = makeRow({ kind: 'smm', current_step: 2 });
    const next = makeRow({ kind: 'smm', current_step: 3 });
    expect(detectMilestones(prev, next, null)[0].title).toBe(
      'A client connected their social accounts',
    );
  });

  it('falls back to "A client" for whitespace-only name', () => {
    const prev = makeRow({ kind: 'smm', current_step: 2 });
    const next = makeRow({ kind: 'smm', current_step: 3 });
    expect(detectMilestones(prev, next, '   ')[0].title).toBe(
      'A client connected their social accounts',
    );
  });

  it('trims surrounding whitespace from a real name', () => {
    const prev = makeRow({ kind: 'smm', current_step: 2 });
    const next = makeRow({ kind: 'smm', current_step: 3 });
    expect(detectMilestones(prev, next, '  Acme  ')[0].title).toBe(
      'Acme connected their social accounts',
    );
  });
});
