# PRD: Viral Format Finder, Phase 10 — Content Lab + Topic Plan Integration

> Series: Viral Format Finder · 10/10 · Draft 2026-05-10

## Purpose & Value

Close the loop. A format is only useful if it becomes a script. This phase wires Format Finder into Content Lab and the `create_topic_plan` tool so a strategist can go from "I like this comparison hook" to a branded PDF deliverable in one flow.

## Problem

Without integration, Format Finder is an island. The whole point is to shorten the path from format inspiration → video idea → script → branded deliverable. Two disconnected surfaces means a copy-paste hand-off step that strategists will skip.

## Primary User

Strategist generating client deliverables. Also: any agent (Nerd, Goodjin) referencing formats in conversation.

## Goals (SMART)

- "Use this format" → Content Lab open with context pre-seeded in ≤2s.
- `create_topic_plan` accepts a `format_slug` parameter and incorporates the format into the generated PDF.
- ≥30% of new topic plans within 30 days of launch reference a format from the library (telemetry-tracked).
- Portal viewers see formats their strategist pinned (read-only) — verifies brand-scoped RLS.

## User Stories

- **US-01** — As a strategist, when I click "Use this format" from VFF-09, Content Lab opens with the format card pinned in the right rail and the system prompt augmented with the format's analysis.
- **US-02** — As a strategist, I can use `/generate` and pass `format=comparison_hook` to seed the topic plan with structural beats from a saved format.
- **US-03** — As Nerd, when a user asks "give me a script in [X] format," I can resolve [X] against the format taxonomy and pull a worked example from the library.
- **US-04** — As a portal viewer, I can see "Inspired by" format references on deliverables my agency sent me, with a small pill that explains the format.

## In Scope

- Content Lab integration:
  - Right-rail pin slot: format card with link back to detail view.
  - System-prompt augmentation: format's `why_it_works`, `structure`, `retention_pattern` injected into the scripting context (`lib/nerd/strategy-lab-scripting-context.ts`).
- `create_topic_plan` tool extension:
  - New optional param `format_slug: string` validated against `viral_formats`.
  - When passed, the tool prepends a "Format reference" block to each generated topic plan section.
  - PDF adapter (`mapTopicPlanToBranded`) renders a "Format" badge per topic card.
- Nerd tool: new tool `resolve_format(name_or_slug)` returns format detail for in-chat reference.
- Portal: read-only view of pinned formats at `/portal/research/formats` scoped to organization.

## Out of Scope

- Auto-generating a full script from a format alone (still requires user prompting).
- Format A/B comparison tool (later).
- Format performance feedback loop ("which formats led to top-performing client videos") — defer to v2.

## Architecture Wiring

- Content Lab right rail: extend existing component (`components/content-lab/content-lab-context-rail.tsx` or similar).
- Scripting context: append format payload in `lib/nerd/strategy-lab-scripting-context.ts`, respect existing 10k-char budget guard (`scripts/smoke-strategy-lab-addendum.ts`).
- Topic plan tool: edit `lib/ai/tools/create-topic-plan.ts` schema + builder.
- PDF: extend `mapTopicPlanToBranded` adapter to surface format badge.
- Nerd registry: add tool in `lib/nerd/registry.ts` per `feedback_session_token_hygiene.md` guidance.
- Portal: new route `app/portal/research/formats/page.tsx`, scoped via `getPortalClient()`.

## Open Questions

1. Should portal viewers see the FULL format library or only pinned-for-their-brand? (Default: pinned only — keeps formats as a value-add the agency curates, not a self-serve trending feed.)
2. Format reference in the PDF — full breakdown, or just a slug badge? (Default: slug badge + 1-line descriptor; deeper info is admin-only.)
3. When the LLM picks a format the strategist didn't select, do we surface that choice visibly? (Default: yes, name the format on the PDF so the strategist can swap if they prefer another.)

## Assumptions

- Content Lab right rail has room for another pin type (verify).
- The scripting-context budget can absorb format payload (~500-800 chars per format) without breaking the 10k cap.
- Portal read-only is enforced by RLS, not just UI hiding.

## Done When

- Use-this-format handoff verified end-to-end.
- A topic plan generated with a format slug renders the badge in PDF.
- Nerd tool resolves slugs in chat.
- Portal viewer can see pinned formats; cannot edit.
- Final visual QA pass: format references feel native in PDF + chat, not bolted on.
