# Auth — Mobile PRD

**Routes:** `/`, `/login`, `/admin/login`, `/forgot-password`, `/reset-password`
**Actor:** public

## Purpose
Authentication surfaces. Login, password reset, root index (probably redirects).

## Desktop UI (UNCHANGED)
- Centered card with brand header (logo + tagline), form fields, primary CTA.
- "Forgot password" / "Sign up" links below.

## Mobile transformations
**Apply from playbook: T1, T2, T3**

### Layout
- Already mobile-friendly (centered card). Verify:
  - Card max-width 420px on `sm+`, full-width with 16px padding below.
  - Form fields 56px tall, 16px font.
  - Primary CTA 56px tall, full-width below `sm`.
- Logo scales down on small screens; minimum 32 × 32.

### Specific pages
- **`/`:** redirects to `/login` or `/admin/dashboard` based on auth state. No UI required on mobile.
- **`/login`:** email + password. "Magic link" alternative (if present).
- **`/admin/login`:** admin-specific entry point with same fields.
- **`/forgot-password`:** email-only form.
- **`/reset-password`:** new password + confirm with strength meter.

## Touch & sizing
- Inputs 56px, 16px font to prevent iOS zoom.
- Password show/hide eye icon: 44 × 44 inside input.

## Out of scope
- Biometric (Face ID / Touch ID) integration on web.

## Acceptance criteria
- Email + password works on iOS Safari (no zoom on focus).
- Forgot/reset flow completes end-to-end on phone.
- Desktop diff = 0 at `lg+`.
