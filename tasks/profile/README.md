# Client Brand Profile Revamp

Mobbin-style left-rail brand profile at `/admin/clients/[slug]/profile/*`, replacing the mega-scroll `/settings/info` plus 8 overlapping sibling settings pages.

## Why

The current `/settings/*` tree has nine pages with heavy overlap (Identity in Info+General, Brand DNA in Info+Brand, Contacts in Info+Contacts, Integrations in Info+Integrations, Webhooks in Partnership+Access). Information about a single client is scattered across screens with no canonical home, and onboarding writes free-text answers into `onboardings.step_state` JSONB without consistently mirroring them onto the `clients` row or related tables the profile reads.

## The 10 PRDs

| # | PRD | Scope |
|---|---|---|
| 01 | [Architecture & Routing](01-architecture.md) | Shell, left rail, redirects, outer-shell wiring |
| 02 | [Overview](02-overview.md) | Read-only workspace-settings summary, hover-to-edit |
| 03 | [Identity](03-identity.md) | Name, website, agency, industry, lifecycle, description, voice, captions, **products**, aliases |
| 04 | [Assets](04-assets.md) | Brand asset uploads + onboarding-source unification |
| 05 | [Users](05-users.md) | Contacts + portal access in one table |
| 06 | [Team](06-team.md) | Strategist + editor assignment |
| 07 | [Deliverables](07-deliverables.md) | Services, monthly output, plan tier |
| 08 | [Notifications](08-notifications.md) | Email toggle groups (affiliate, social, drops, revisions) |
| 09 | [Integrations & Webhooks](09-integrations.md) | Social connections, uppromote, revision webhooks |
| 10 | [Onboarding rewrite](10-onboarding.md) | Map every onboarding question to a profile field; nothing else gets written |

## Hard rules across all PRDs

1. **Onboarding writes only to profile fields.** Nothing lands in `onboardings.step_state` that isn't mirrored onto a real table the profile reads. The legacy `onboarding_uploads` table is unused (broken FK since migration 228) and stays unused.
2. **Profile fields are the source of truth.** When a value exists on both `clients` and `onboardings.step_state`, profile reads from `clients`. The mirror runs one-way (onboarding → clients), never the reverse.
3. **No new top-level URLs without a rail entry.** Anything reachable from a brand should be on the rail; subpages live under `/profile/<section>` only.
4. **Old `/settings/*` redirects stay in place until PRD 09 lands.** Kill the old routes in the final phase (after every section ports across), not piecemeal.
5. **Each PRD ships independently.** Typecheck + lint + commit per PRD. No PRD depends on a later one merging first.
