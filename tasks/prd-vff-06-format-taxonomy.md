# PRD: Viral Format Finder, Phase 06 — Format Taxonomy

> Series: Viral Format Finder · 06/10 · Draft 2026-05-10

## Purpose & Value

Define the controlled vocabulary the LLM picks from in VFF-05 and the UI groups by in VFF-07. Without a taxonomy, every Gemini run invents its own labels and the library becomes ungroupable. The taxonomy is small, opinionated, and editable.

## Problem

If hook_type is a free-text field, we get 200 variants of "curiosity gap" and the Netflix rows can't aggregate them. Format intelligence requires SHARED labels across videos so a strategist can say "show me POV hooks" and get a coherent row.

## Primary User

Internal strategists (consume + edit the taxonomy). Goodjin / future skill agents will read it for prompt augmentation.

## Goals (SMART)

- Taxonomy seeded with 40-60 entries across the 4 dimensions on day 1.
- ≥95% of analyzed videos (VFF-05) match an existing slug; ≤5% trigger the LLM to propose a new slug for admin review.
- Taxonomy edit cycle (add new slug + redeploy embedding seed) ≤ 5 min.

## User Stories

- **US-01** — As a strategist, I can browse the taxonomy at `/admin/formats/taxonomy` and see every slug grouped by dimension with description + example video.
- **US-02** — As an admin, I can add / edit / archive a slug and see the change propagate to the next analysis run.
- **US-03** — As the system, when the LLM proposes a slug not in the taxonomy, it queues for review in `format_taxonomy_proposals` rather than auto-creating.

## In Scope

- Seed data migration `169_seed_format_taxonomy.sql` inserting initial taxonomy:
  - **hook_type** (15-20): curiosity_gap, controversial_claim, problem_setup, comparison_hook, transformation_promise, listicle_promise, fear_appeal, social_proof_open, statistic_shock, pov_drop, question_open, quote_open, day_in_life_open, demo_open, behind_scenes_open.
  - **structure** (10-15): listicle, comparison, narrative_arc, before_after, problem_solution, pov_story, demo_walkthrough, day_in_life, reaction_breakdown, q_and_a, talking_head_explainer, on_screen_text_only, voiceover_b_roll, interview_format, montage.
  - **archetype** (8-10): talking_head, b_roll_voiceover, on_screen_text_overlay, reaction_split_screen, ugc_testimonial, screen_recording, interview, animation, mixed_media, ai_generated.
  - **pacing** (5-8): fast_cuts, slow_burn, escalating, even_tempo, hook_heavy, climax_back, sustained_tension.
- Edit UI: `/admin/formats/taxonomy` page with CRUD on each dimension.
- LLM proposal flow: when VFF-05 emits a slug not in taxonomy, create `format_taxonomy_proposals` row instead of failing.
- Proposal review surface: same page, "Pending proposals" tab.

## Out of Scope

- Multi-language taxonomy (English only).
- Auto-merging similar proposals (admin reviews manually).
- Per-brand taxonomy overrides (global taxonomy v1).

## Architecture Wiring

- Reuses `viral_formats` table from VFF-01.
- New table `format_taxonomy_proposals` (proposal_text, proposed_by, video_id_evidence, status enum, created_at).
- LLM prompt in `lib/formats/analyze-video.ts` injects the current taxonomy as a constrained-choice list at runtime.
- Taxonomy edit UI lives under existing admin shell, uses `IconCard` design system per memory note.

## Open Questions

1. When a slug is archived, do existing analyses get re-mapped or kept as-is? (Default: kept as-is; archived slugs render with a faded badge.)
2. Should slugs have aliases? (Default: yes, comma-separated alias list helps the LLM map fuzzy outputs.)
3. Per-dimension cap (e.g. max 25 hook_types)? (Default: no hard cap; soft warning at 30.)

## Assumptions

- Strategists will add ~2-3 new slugs/month based on emerging formats.
- The initial seed covers ≥90% of short-form content patterns we'll see in 2026.
- Taxonomy stability matters more than completeness — better to alias than fragment.

## Done When

- Seed migration applied + verified in `/admin/formats/taxonomy`.
- LLM analysis run on 50 fresh videos shows ≥95% slug match rate.
- Taxonomy edit cycle (add → live in analysis) demonstrated in <5 min.
