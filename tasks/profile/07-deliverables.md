# PRD 07 — Deliverables

## Goal

The plan + capacity tab. What we ship monthly, which plan tier they're on, and the posting defaults (platforms, cadence) that drive auto-scheduling.

Per Jack's directional pivot (`project_credits_directional_pivot.md`): the external product is "deliverables / production capacity / monthly output". Credits stay internal accounting; this page is **client-facing language**, not SaaS billing aesthetic.

## Data model

Existing on `clients`:
- `service_tier` text — `starter`, `growth`, `pro`, etc.
- `monthly_post_count` integer
- `services jsonb` — array like `[{ key, label, enabled }]`
- `default_platforms text[]` — `['instagram','tiktok','youtube_shorts']`
- `posting_window_start_hour`, `posting_window_end_hour`, `posting_timezone`

Will add via migration 320 if missing — confirm at build time.

## UI spec

Mobbin "Billing plan" layout. One card stack:

1. **Plan** — Named tier (e.g. "Growth"), with the included monthly post count rendered big and the per-platform breakdown rendered small. "Change plan" pill opens an admin dialog (no Stripe — admins set this manually).
2. **Services** — Checkbox list of what we deliver: short-form video, captions, scheduling, community management, affiliate program, etc. Stored as `services` jsonb.
3. **Posting defaults** — Platforms (multi-select chips), posting window (start–end hour), timezone.
4. **Pipeline visibility** (read-only summary) — count of drops in each status (planning / drafting / approval / scheduled / posted) sourced from `editing_projects`. Links into `/admin/clients/[slug]/deliverables` for the full pipeline.

## API

- `PATCH /api/admin/clients/[slug]` — accept `service_tier`, `monthly_post_count`, `services`, `default_platforms`, posting window fields
- `GET /api/admin/clients/[slug]/pipeline-summary` — returns `{ planning, drafting, approval, scheduled, posted }` counts

## Done criteria

- [ ] Named tier renders prominently (Mobbin-style billing card)
- [ ] Services checklist saves atomically
- [ ] Posting defaults validate: end-hour > start-hour, timezone is IANA
- [ ] Pipeline summary shows real counts; "Open pipeline" link routes correctly

## Out of scope

- Stripe billing wiring — pivot says credits/Stripe is internal accounting only
- Per-platform monthly caps — single shared cap for now
