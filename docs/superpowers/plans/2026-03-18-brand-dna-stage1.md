# Brand DNA Engine — Stage 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `getBrandContext()` function and wire it into all four prompt builders so every AI tool consumes brand context from a single source.

**Architecture:** A new `getBrandContext(clientId)` function reads the active `brand_guideline` knowledge entry, parses it into a typed `BrandContext` object with `toPromptBlock()` and `toFullContext()` methods, caches results for 5 minutes, and falls back to raw client fields when no guideline exists. Four existing prompt builders are updated to use it.

**Tech Stack:** TypeScript, Supabase (existing admin client), existing knowledge entry system

**Pre-existing work (already complete):**
- Task 1.1: `brand_guideline` type + `BrandGuidelineMetadata` interface in `lib/knowledge/types.ts`
- Task 1.2: `onboarded_via` + `brand_dna_status` columns via migration 040
- Task 1.3: `brand-assets` storage bucket + `brand_dna_jobs` table via migration 040
- Task 1.8: All Brand DNA TypeScript types (`BrandColor`, `BrandFont`, etc.) in `lib/knowledge/types.ts`

---

## Remaining Tasks

### Task 1: Build `BrandContext` type and `getBrandContext()` function (PRD 1.4-1.7)

**Files:**
- Create: `lib/knowledge/brand-context.ts`

**Context:** The existing `lib/prompts/brand-context.ts` is the OLD `formatBrandPreferencesBlock()`. The NEW file goes in `lib/knowledge/`.

- [ ] Create `lib/knowledge/brand-context.ts` with `BrandContext` interface, `getBrandContext()` function, `toPromptBlock()`, `toFullContext()`, in-memory cache with 5min TTL, `invalidateBrandContext()`, and fallback to raw client fields
- [ ] Type-check: `npx tsc --noEmit`
- [ ] Commit: `feat: add getBrandContext() unified brand context function`

### Task 2: Wire into topic research prompt (PRD 1.9)

**Files:**
- Modify: `lib/prompts/topic-research.ts`
- Modify: search processing route (caller)

- [ ] Add `brandDna?: string | null` to `TopicResearchConfig`
- [ ] Use `brandDna` as entire brand context block when provided, keep existing logic as fallback
- [ ] Update caller to pass `brandContext.toPromptBlock()`
- [ ] Type-check and commit

### Task 3: Wire into client strategy prompt (PRD 1.10)

**Files:**
- Modify: `lib/prompts/client-strategy.ts`
- Modify: search processing route (caller)

- [ ] Same pattern as Task 2 for `ClientStrategyConfig`
- [ ] Type-check and commit

### Task 4: Wire into idea generator (PRD 1.11)

**Files:**
- Modify: `lib/knowledge/idea-generator.ts`

- [ ] Call `getBrandContext(clientId)` and replace manual `<brand>` block with `toPromptBlock()`
- [ ] Keep other context blocks (strategy, past research, saved ideas) unchanged
- [ ] Type-check and commit

### Task 5: Wire into pillar generator (PRD 1.12)

**Files:**
- Modify: `app/api/clients/[id]/pillars/generate/route.ts`

- [ ] Call `getBrandContext(clientId)` in `processGeneration()` and replace manual `<brand>` block
- [ ] This fixes the known gap where pillar generation ignores `preferences`
- [ ] Type-check and commit

### Task 6: Final verification

- [ ] Full type-check: `npx tsc --noEmit`
- [ ] Lint: `npm run lint`
- [ ] Build: `npm run build`
- [ ] Verify backward compat: clients without brand guidelines fall back to client fields
