/**
 * Per-kind screen definitions for the v2 onboarding stepper.
 *
 * The DB stores a single `onboardings` row with `kind` ('smm' | 'editing'),
 * `current_step` (int), and `step_state` (jsonb). This module is the single
 * source of truth for which screens exist for each kind, what their order
 * is, what JSONB key they own in step_state, and what the admin tracker
 * shows as the human-readable label.
 *
 * Reordering or adding a screen here is a real schema change for the
 * stepper, but does NOT require a DB migration: the JSONB shape is
 * append-only, and `current_step` is just an int index. Removing a
 * screen IS a breaking change for any in-flight onboarding sitting on
 * that index, so prefer to soft-deprecate (mark `hidden: true`) rather
 * than splice the array.
 */

export type OnboardingKind = 'smm' | 'editing';

export interface OnboardingScreen {
  /** Stable component key. Routed to per-screen client component. */
  key: string;
  /** Human-readable label (used in admin tracker + progress chrome). */
  label: string;
  /**
   * JSONB key this screen owns in step_state. The done/welcome screens
   * have null because they don't write state, just gate progression.
   */
  step_state_key: string | null;
  /** Optional one-line description for the admin tracker tooltip. */
  description?: string;
}

/**
 * SMM = social media management. 5 screens.
 *   0 welcome           -> agency-aware intro
 *   1 points_of_contact -> who's on the client side (mirrors `contacts` table)
 *   2 brand_basics      -> tagline, what/who/voice/offers, prefilled from `clients`
 *   3 social_connect    -> per-platform Zernio OAuth + Meta Business Suite tile
 *   4 done              -> handoff
 */
const SMM_SCREENS: readonly OnboardingScreen[] = [
  {
    key: 'welcome',
    label: 'Welcome',
    step_state_key: null,
    description: 'Agency-aware intro to the SMM onboarding flow.',
  },
  {
    key: 'points_of_contact',
    label: 'Points of contact',
    step_state_key: 'points_of_contact',
    description: 'Who on your team should we loop in.',
  },
  {
    key: 'brand_basics',
    label: 'Brand basics',
    step_state_key: 'brand_basics',
    description: 'Tagline, what you sell, audience, voice, current offers.',
  },
  {
    key: 'social_connect',
    label: 'Connect socials',
    step_state_key: 'social_handles',
    description: 'Zernio OAuth per platform + Meta Business Suite access.',
  },
  {
    key: 'done',
    label: 'Done',
    step_state_key: null,
    description: 'Handoff complete.',
  },
] as const;

/**
 * Editing = post-production deliverables. 4 screens.
 *   0 welcome                  -> partnership framing
 *   1 brand_basics             -> same component as SMM
 *   2 footage_and_references   -> raw footage, reference edits, prior edits, offers, notes
 *   3 done                     -> 7-step cadence + ops email books kickoff
 */
const EDITING_SCREENS: readonly OnboardingScreen[] = [
  {
    key: 'welcome',
    label: 'Welcome',
    step_state_key: null,
    description: 'Partnership framing for the editing relationship.',
  },
  {
    key: 'brand_basics',
    label: 'Brand basics',
    step_state_key: 'brand_basics',
    description: 'Tagline, what you sell, audience, voice, current offers.',
  },
  {
    key: 'footage_and_references',
    label: 'Footage and references',
    step_state_key: 'footage_and_references',
    description: 'Raw footage, reference edits, prior edits, free-form notes.',
  },
  {
    key: 'done',
    label: 'Done',
    step_state_key: null,
    description: 'Handoff complete.',
  },
] as const;

export const SCREENS: Record<OnboardingKind, readonly OnboardingScreen[]> = {
  smm: SMM_SCREENS,
  editing: EDITING_SCREENS,
};

/** Total screens for a given kind. Convenience for "step X of N" copy. */
export function totalScreens(kind: OnboardingKind): number {
  return SCREENS[kind].length;
}

/** Look up a screen by index. Returns null if out of bounds. */
export function screenAt(kind: OnboardingKind, index: number): OnboardingScreen | null {
  const list = SCREENS[kind];
  if (index < 0 || index >= list.length) return null;
  return list[index] ?? null;
}

/** Index of the terminal "done" screen for a given kind. */
export function doneIndex(kind: OnboardingKind): number {
  return SCREENS[kind].length - 1;
}

/** True if the given step index lands on the terminal "done" screen. */
export function isDoneStep(kind: OnboardingKind, step: number): boolean {
  return step === doneIndex(kind);
}
