/**
 * Per-kind screen definitions for the v2 onboarding stepper.
 *
 * The DB stores a single `onboardings` row with `kind` ('smm' | 'editing'),
 * `current_step` (int), and `step_state` (jsonb). This module is the single
 * source of truth for which screens exist for each kind, what their order
 * is, what JSONB key they own in step_state, and what the admin tracker
 * shows as the human-readable label.
 *
 * The stepper UI walks `SCREENS[kind][current_step]` and looks up the
 * screen component by `key`. The admin tracker uses `label` for the
 * progress copy ("Brand basics, step 2 of 7"). The `step_state_key`
 * tells the per-screen component which slot in step_state it owns.
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
 * SMM = social media management. 7 screens.
 *   0 welcome      -> intro + what to expect
 *   1 brand_basics -> name, tagline, voice, audience snapshot
 *   2 social_connect -> Zernio OAuth per platform in `platforms`
 *   3 content_prefs -> cadence, content pillars, do/don't list
 *   4 audience_tone -> persona + tone descriptors
 *   5 kickoff_pick  -> calendar slot pick (gates on team availability)
 *   6 done         -> handoff message, what happens next
 */
const SMM_SCREENS: readonly OnboardingScreen[] = [
  {
    key: 'welcome',
    label: 'Welcome',
    step_state_key: null,
    description: 'Intro to the onboarding flow.',
  },
  {
    key: 'brand_basics',
    label: 'Brand basics',
    step_state_key: 'brand_basics',
    description: 'Brand name, tagline, audience snapshot.',
  },
  {
    key: 'social_connect',
    label: 'Connect socials',
    step_state_key: 'social_handles',
    description: 'Connect each platform via Zernio OAuth.',
  },
  {
    key: 'content_prefs',
    label: 'Content preferences',
    step_state_key: 'content_prefs',
    description: 'Cadence, content pillars, do and do-not list.',
  },
  {
    key: 'audience_tone',
    label: 'Audience and tone',
    step_state_key: 'audience_tone',
    description: 'Target persona and tone descriptors.',
  },
  {
    key: 'kickoff_pick',
    label: 'Schedule kickoff',
    step_state_key: 'kickoff_pick',
    description: 'Pick a kickoff time when the assigned team is free.',
  },
  {
    key: 'done',
    label: 'Done',
    step_state_key: null,
    description: 'Handoff complete.',
  },
] as const;

/**
 * Editing = post-production deliverables. 5 screens.
 *   0 welcome           -> intro
 *   1 project_brief     -> what we are editing, deliverables, references
 *   2 asset_link        -> cloud-storage drop link (Drive/Dropbox)
 *   3 turnaround_ack    -> 5-7 day expectation copy + ack
 *   4 done              -> handoff
 */
const EDITING_SCREENS: readonly OnboardingScreen[] = [
  {
    key: 'welcome',
    label: 'Welcome',
    step_state_key: null,
    description: 'Intro to the editing onboarding flow.',
  },
  {
    key: 'project_brief',
    label: 'Project brief',
    step_state_key: 'project_brief',
    description: 'Project description, deliverables, references.',
  },
  {
    key: 'asset_link',
    label: 'Drop your assets',
    step_state_key: 'asset_link',
    description: 'Cloud-storage link to raw footage.',
  },
  {
    key: 'turnaround_ack',
    label: 'Turnaround',
    step_state_key: 'turnaround_ack',
    description: '5-7 day turnaround expectations.',
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
