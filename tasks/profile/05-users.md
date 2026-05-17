# PRD 05 — Users

## Goal

Merge contacts and portal invites into one Mobbin-style users table with a role pill that distinguishes the two. Replaces the existing `ClientContactsCard` + the implicit portal-access management buried in invite tokens.

## Data model

No new tables. Read from:

- `contacts` — name, email, phone, role (free text), project_role, is_primary, created_at
- `invite_tokens` — token, email, expires_at, used_at, used_by, created_at
- `users` — for `used_by` lookups (full_name, email)

## UI spec

| Column | Source |
|---|---|
| Avatar | Initials from name or email |
| Name | `contacts.name` or `users.full_name` for redeemed invites |
| Email | `contacts.email` or `invite_tokens.email` |
| Role pill | `Primary contact` / `Contact` / `Portal viewer` / `Pending invite` / `Expired invite` |
| Project role | `contacts.project_role` (e.g. "Approver", "Strategy lead") — empty for portal rows |
| Last active | `users.last_sign_in_at` for portal users, else "—" |
| Actions | Per-row dropdown: Edit, Resend invite, Revoke, Make primary, Remove |

Header row: search input + "Invite portal user" button (primary) + "Add contact" button (ghost).

## API

Existing:
- Contacts CRUD via existing `/api/clients/[id]/contacts/*` (verify or add as needed)
- Invites via existing `/api/invites/*`

Add:
- `GET /api/admin/clients/[slug]/users-summary` — single endpoint that returns the unified row shape (contacts + invites + resolved users in one fetch) so the page renders in one round trip

## Done criteria

- [ ] Single sorted table — primary first, then alphabetical
- [ ] Pending invites show expiry countdown ("expires in 4d")
- [ ] Resend invite hits `/api/invites` with the existing endpoint
- [ ] Search filters across name + email
- [ ] Empty state: "Invite the client's team — they'll see your work in the portal."

## Out of scope

- Bulk invite via CSV — single invite UI only for now
- Role permissions beyond the existing admin/viewer split
