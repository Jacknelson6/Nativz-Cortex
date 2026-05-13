# Ops token pages — Mobile PRD

**Routes:** `/comptroller/[token]`, `/submit-payroll/[token]`, `/connect/[slug]/[platform]`, `/connect/invite/[token]`
**Actor:** public (token-gated) or internal team via email link

## Purpose
Internal ops one-shot links.
- `/comptroller/[token]`: accounting access for the comptroller user (limited surface).
- `/submit-payroll/[token]`: payroll submission for editors.
- `/connect/[slug]/[platform]`: social-platform OAuth connect (e.g. Instagram for client).
- `/connect/invite/[token]`: connect-invite landing for clients invited to authorize platforms.

## Desktop UI (UNCHANGED)
- Mostly form-driven single-card pages.
- `/connect/*` flows hand off to platform OAuth (external).

## Mobile transformations
**Apply from playbook: T1, T2, T3**

### Layout
- Centered card pattern (same as `single-action-tokens.md`).
- Forms: single-column, 48px input rows, 16px font.
- OAuth handoff buttons: 56px tall, brand-accent (e.g., Instagram pink, TikTok black) where appropriate.

### Per page
- **`/comptroller`:** simple table → card list for the comptroller's scoped invoices.
- **`/submit-payroll`:** form for editor to submit completed deliverables. Each line item is a card with editable count + rate + total.
- **`/connect/[slug]/[platform]`:** big platform logo + "Connect [Platform]" button → OAuth handoff.
- **`/connect/invite/[token]`:** lands here from connection-invite email. List of platforms to connect, each with connect button.

## Out of scope
- Bulk-connect every platform at once.

## Acceptance criteria
- OAuth handoff returns cleanly on iOS Safari (cookies + redirect work).
- Payroll submit goes through in 1 tap after form fill.
- Desktop diff = 0 at `lg+`.
