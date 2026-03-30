# PRD: Strategy Lab — unified strategy brain

**Status:** Draft (living document)  
**Owner:** Product / eng  
**Last updated:** 2026-03-27  
**Related:** Strategy Lab UI (`/admin/strategy-lab/[clientId]`), The Nerd (`/admin/nerd`), analytics, knowledge vault, content pillars

---

## 1. Problem

Strategists need **one place** to review and create video strategy: topic research, pillars, brand DNA, idea batches, reference analysis, **and** a conversational layer that understands **all** of that context plus performance data and assets. Today pieces exist in separate surfaces; the goal is a **coherent “brain”** that compounds over time.

## 2. Vision

**Strategy Lab** is the workspace where the team **builds** the funnel (topic search → pillars → brand DNA → named idea batches → analysis boards). **The Nerd** (and/or a dedicated strategy chat mode) is the **dialogue layer**: ask questions, compare posts, pressure-test pillars, and turn insights into shoot-ready direction.

The brain should eventually ingest:

| Source | Purpose |
|--------|-----------|
| Topic searches | What we researched and what angles surfaced |
| Content pillars (DB) | Structural themes for the client |
| Brand DNA (bento + guideline) | Voice, visuals, positioning for on-brand ideas |
| Knowledge vault | SOPs, docs, meeting notes, scraped pages |
| Analytics (per client / platform) | What’s working; tie insights to pillars |
| Affiliates (when enabled) | Partner / referral performance |
| Analysis boards | Reference clips, hooks, patterns |
| Video assets (future) | Understand hooks, pacing, entertainment value |

## 3. Non-goals (for v1 of this PRD)

- Replacing the full Brand DNA editor inside Strategy Lab (inline editing already exists; full page remains).
- Fully automated “video understanding” at scale without human-triggered analysis (phased).

## 4. Success metrics

- Strategists **prefer** Strategy Lab + Nerd for pillar reviews vs. ad-hoc docs.
- Time from “what should we shoot?” to **named idea batch** decreases.
- Fewer duplicate conversations because **context is injected** for @mentioned clients.

---

## 5. Phased backlog (implementation checklist)

Use `- [ ]` / `- [x]` in this file as work completes. Agents should **implement top-down** within a phase unless dependencies require otherwise.

### Phase A — Context injection (server) — **implemented**

- [x] PRD + backlog document (`docs/prd-strategy-lab-brain.md`)
- [x] `buildStrategyLabContextPack(clientId)` — live snapshot: content pillars, recent completed topic searches, brand DNA tone snippet (`lib/nerd/strategy-lab-context-pack.ts`)
- [x] Append pack to Nerd **portfolio context** when a **client @mention** is present (`app/api/nerd/chat/route.ts`)
- [x] Lightweight metrics in pack (pillar count in header, completed idea generations count, topic search list capped)
- [x] Log token impact / truncation strategy if packs grow (monitoring only) — hard cap via `truncateStrategyLabContextPack`

### Phase B — Strategy Lab ↔ Nerd UX

- [x] Deep link `?strategyClient=` prefills prompt + mention (`app/admin/nerd/page.tsx`)
- [x] Strategy assistant card: link opens Nerd in a **new tab** to preserve the Strategy Lab workspace
- [x] `?strategySource=strategy-lab` sets a **session hint** so Nerd knows the conversation began from Strategy Lab

### Phase C — Analytics & performance in the loop

- [x] Document which **Nerd tools** expose analytics — see appendix below
- [x] “Performance snapshot” one-liner in `buildStrategyLabContextPack` when last-7d aggregates exist (plus top recent posts)
- [x] Analytics deep link: `/admin/analytics/social?clientId=` pre-selects client (`useReportingData` + `AnalyticsDashboard`); Strategy assistant card links here

### Phase D — Affiliates — **implemented**

- [x] If affiliate integration is active, append affiliate summary lines to the pack (plus tool hint)
- [x] Nerd tool discoverability: slash command and suggestion prompt for affiliate performance

### Phase E — Video & creative understanding

- [x] Define v1 input: analysis board IDs and analyzed board video items (existing board/media pipeline)
- [x] On-demand strategy summaries reuse existing transcript + analysis structured artifacts on `moodboard_items`
- [x] Nerd tools: `summarize_video_for_strategy` + `get_analysis_board_summary`
- [x] Strategy Lab: “Send to Cortex” action on analysis boards

### Phase F — Hardening — **implemented**

- [x] Rate limits on pack size; truncate pillar descriptions and cap total context pack size
- [x] E2E smoke: admin crawl now visits Strategy Lab, analytics client preselect, and Nerd Strategy Lab deep link
- [x] Privacy guard: only visible clients can produce mention-based strategy packs

---

## 6. Appendix — Code map

| Area | Path |
|------|------|
| Strategy Lab page | `app/admin/strategy-lab/[clientId]/page.tsx` |
| Workspace UI | `components/strategy-lab/strategy-lab-workspace.tsx`, `strategy-lab-content-stack-card.tsx` |
| Nerd chat API | `app/api/nerd/chat/route.ts` |
| Context pack builder | `lib/nerd/strategy-lab-context-pack.ts` |
| PRD / backlog | `docs/prd-strategy-lab-brain.md` |

### Nerd tools — analytics-related (admin)

- `get_analytics_summary` — `lib/nerd/tools/analytics.ts`
- `get_client_analytics` — `lib/nerd/tools/clients.ts`
- `compare_client_analytics` — `lib/nerd/tools/analytics.ts`

The model should call these when the user asks for performance; the Strategy Lab **pack** is a static snapshot and does not replace live tool calls.

### Nerd tools — strategy-board / affiliate-related (admin)

- `get_affiliate_summary` — `lib/nerd/tools/affiliates.ts`
- `list_affiliates` — `lib/nerd/tools/affiliates.ts`
- `get_affiliate_referrals` — `lib/nerd/tools/affiliates.ts`
- `get_analysis_board_summary` — `lib/nerd/tools/moodboard.ts`
- `summarize_video_for_strategy` — `lib/nerd/tools/moodboard.ts`

---

## 7. Implementation log

| Date | Change |
|------|--------|
| 2026-03-27 | Initial PRD; Phase A pack builder + Nerd wiring for @mentioned clients |
| 2026-03-27 | Analytics `?clientId=` preselect + Strategy assistant analytics button; fixed JSX `->` in ai-routing-summary-section |
| 2026-03-27 | Added performance + affiliate lines to Strategy Lab pack, plus total pack truncation and unit test |
| 2026-03-27 | Added board/video strategy tools, Strategy Lab → Cortex board handoff, session hinting, and admin crawl smoke coverage |
