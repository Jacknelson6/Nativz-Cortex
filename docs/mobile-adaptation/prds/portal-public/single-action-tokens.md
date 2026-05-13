# One-shot token pages — Mobile PRD

**Routes:** `/s/[token]` (team invite accept), `/p/digest-unsubscribe/[token]`, `/join/[token]` (covered in `auth/onboarding.md`)
**Actor:** public (token-gated)

## Purpose
Single-action public pages. Each is "tap this URL → take one action → done."

## Desktop UI (UNCHANGED)
- Centered card with brand header, action body, primary CTA, secondary "decline" or "go elsewhere" link.

## Mobile transformations
**Apply from playbook: T1, T2, T3**

### Layout
- Already largely mobile-friendly (single centered card). Bump to fill `min-h-dvh`.
- Card max-width 480px on `sm+`. Below `sm`, edge padding 16px.
- Primary CTA full-width, 56px tall.

### Per page
- **`/s/[token]` (team invite accept):** lands here from the team invite email. Form to set name + password. Submit creates auth user, links team_members.user_id.
- **`/p/digest-unsubscribe/[token]`:** one button "Unsubscribe." Confirm via secondary "Resubscribe later" link.

## Out of scope
- Custom-branded surfaces beyond agency branding (already supported via `detectAgencyFromHostname`).

## Acceptance criteria
- Accept / unsubscribe action works in 1 tap (plus form on accept).
- Email-link → action → success interstitial all readable on iPhone SE.
- Desktop diff = 0 at `lg+`.
