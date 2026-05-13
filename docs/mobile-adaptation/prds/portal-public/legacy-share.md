# Legacy share namespaces — Mobile PRD

**Routes:** `/shared/ad-creatives/[token]`, `/shared/analyze-social/[token]`, `/shared/calendar-connect/[token]`, `/shared/join/[token]`, `/shared/moodboard/[token]`, `/shared/nerd/[token]`, `/shared/post/[token]`, `/shared/prospect/[token]`, `/shared/report/[token]`, `/shared/search/[token]`
**Actor:** public (token-gated)

## Purpose
Legacy `/shared/*` namespace covering 10 different share kinds. Each renders a read-only view of an internal artifact for sharing externally.

## Desktop UI (UNCHANGED)
- Each share kind has its own design (audit report, moodboard, prospect deck, etc.) — generally a read-only card stack.

## Mobile transformations
**Apply from playbook: T1, T2, T3, T6**

### Shared pattern across the namespace
- Page header with agency branding + title.
- Single-column content stack.
- Sticky CTA where applicable (e.g. "Schedule a call" on prospect shares).
- Filter / nav pills (T6) where the artifact has sub-sections (audit report, search results).

### Per-kind notes
- **`/shared/ad-creatives/[token]`:** mirrors `/ads/batches` mobile pattern.
- **`/shared/analyze-social/[token]`:** mirrors `/spying/audits/[id]` pattern.
- **`/shared/moodboard/[token]`:** mirrors `/admin/moodboard/[id]`.
- **`/shared/post/[token]`:** single post mockup full-width.
- **`/shared/prospect/[token]`:** mirrors prospect-present (read-only mobile).
- **`/shared/report/[token]`:** generic report viewer — long content with section anchor scroll.
- **`/shared/search/[token]`:** mirrors `/finder/[id]` results pattern.
- **`/shared/nerd/[token]`:** developer-shared API extract; mirrors `/admin/nerd` cards.
- **`/shared/calendar-connect/[token]`, `/shared/join/[token]`:** one-shot action pages — see `single-action-tokens.md`.

## Out of scope
- Migrating these to the newer `/c/*` namespace (separate cleanup task).

## Acceptance criteria
- Each kind renders without horizontal scroll on iPhone SE.
- Sticky CTAs where relevant.
- Desktop diff = 0 at `lg+`.
