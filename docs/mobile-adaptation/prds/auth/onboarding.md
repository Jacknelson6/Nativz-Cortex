# Public onboarding — Mobile PRD

**Routes:** `/join/[token]`, `/onboarding/[token]`
**Actor:** public (token-gated)

## Purpose
First-run flows.
- `/join/[token]`: client portal invite — lands here from `invite_tokens`. Set password, accept.
- `/onboarding/[token]`: public intake form for new clients (used in the editing-packages e2e flow).

## Desktop UI (UNCHANGED)
- Centered card for `/join`.
- Multi-step wizard for `/onboarding`.

## Mobile transformations
**Apply from playbook: T1, T2, T3, T5**

### `/join/[token]`
- Mirrors `/s/[token]` pattern. Centered card with name + password fields, accept CTA.

### `/onboarding/[token]`
- Multi-step wizard. Each step fills the viewport.
- Stepper bar at top (numbered with progress fill).
- Sticky bottom Continue / Back buttons.
- File uploads (logo, asset references): tap-to-upload, camera permission iOS handles natively.
- Auto-save between steps so a phone interrupt doesn't lose progress.

## Touch & sizing
- Wizard steps: 16px padding, 56px form inputs.
- Stepper: 32px tall.

## Out of scope
- Branching wizard paths (current flow is linear).

## Acceptance criteria
- Onboarding intake submittable from phone end-to-end.
- Resume-mid-wizard works if user closes and re-opens the email link.
- Desktop diff = 0 at `lg+`.
