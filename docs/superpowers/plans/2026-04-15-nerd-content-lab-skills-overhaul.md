# Nerd × Content Lab × Skills Overhaul

**Date:** 2026-04-15
**Status:** Draft — reconstructed from Cursor chat after crash. Original plan lost; this captures Jack's confirmed answers so the next session starts from a real file, not memory.

---

## Mental model

- **The Nerd = the model.** Think ChatGPT at OpenAI: the Nerd is our one underlying agent.
- **Harnesses = product surfaces that wrap the Nerd.** Admin Content Lab, Portal Content Lab, Admin Nerd chat, Portal Nerd chat — each is a harness with its own capability set.
- **Skills are scoped to harnesses.** Admin Content Lab ≠ Portal Content Lab in what skills fire. Portal side never reaches across clients; admin side may have in-testing capabilities the portal doesn't yet get.

---

## 1. Route rename → Content Lab (hard cutover)

- Strategy Lab → Content Lab, everywhere. No dual-naming, no deprecation layer.
- Includes routes, nav copy, breadcrumbs, URL params (`?strategy=…` etc.), any file-level comments / component names where it's user-visible. Keep internal route paths if rename churn isn't worth it, but all user-visible copy flips.
- Confirm the April rename commit (`c10cea2 refactor(content-lab): rename Strategy Lab → Content Lab across codebase`) actually covered every surface; sweep anything it missed.

## 2. Skills data model

Two new tables (naming TBD; matches the Mar-19 cortex-skills spec's rough shape but scoped differently):

- **`nerd_skills`** — skill definitions: slug, name, short description, trigger patterns, body (markdown), cross-references to other skills.
- **`nerd_skill_scopes`** — which harness the skill fires in. Matrix of `(skill_id, harness, enabled)` where harness ∈ `admin_nerd | admin_content_lab | portal_nerd | portal_content_lab`.

### Scoping rules

- Admin skills fire in admin harnesses by default.
- Portal skills fire in portal harnesses.
- **An admin skill can be flipped to also-enable for client harnesses** via a toggle in `/admin/settings` → AI settings. Default off. Individual per-skill control.
- Portal never inherits admin-only skills without the explicit toggle.

### Composable skill graph (stretch / architecture direction)

- Skills are markdown files (or DB rows with markdown body) that can `[[reference]]` each other — like the GraphRAG-style knowledge graph pattern the Brain already uses.
- The Nerd can traverse from one skill to related skills when composing a response. Small harness, many composable skills > one monolithic system prompt.

## 3. Slash-command UX (Claude Code parity)

- Type `/` in any Nerd chat → dropdown of available skills (filtered by harness + org).
- Each entry shows: `slug` + short description alongside.
- Tab-completes. Arrow keys navigate. Enter inserts the slash command.
- No separate menu per skill — invocation IS the command. `/generate` just runs; no wizard modal.
- Bigger command-input button (visual affordance) so it's obvious slash commands exist.

## 4. Artifacts / PDF generation

### Trigger — hybrid

- **Explicit:** `/generate …` always produces a PDF deliverable.
- **Implicit intent detection:** when the user says "generate 20 video ideas" (or similar create/make/produce verbs applied to deliverable-shaped nouns), the Nerd recognizes it as PDF-worthy and produces one. Same intuition Claude Code uses when deciding "this is a file to write" vs "this is a chat response."

### Inline vs PDF decision tree

| Example prompt | Output format |
|---|---|
| "What is my engagement rate trend?" | Verbose text answer |
| "Show me the pillars" | Inline markdown table |
| "/generate content plan" | PDF deliverable |
| "Generate 20 video ideas" (no slash) | PDF deliverable (intent-detected) |

### PDF templates

- **One template.** Not multiple. Branded per agency.
- Agency branding = logo swap + primary accent color swap. Layouts are identical across agencies.
- Rendered in React (so artifacts can live inline too) → converted to PDF for download. Same pipeline as the existing artifact system (mermaid/html visuals already follow this pattern per the April 11 Strategy Lab QA notes).
- Paginated.
- Jack to send example PDFs he wants to match. **Open — attach before implementation.**

## 5. Tool-call visibility

- **Show** when a tool fires — valuable feedback, don't hide it.
- **Client-friendly labels** when in a client context:
  - Good: `Calling Bob's Produce knowledge base · fetched 12 entries`
  - Bad: `POST /api/portal/nerd/search/knowledge?client_id=…`
- Raw API paths never surface in the UI. Internal slugs get display-name overrides.

---

## Open questions / still owed

1. **Example PDFs** — Jack to send reference artifacts so the template matches his vision.
2. **Skill authoring workflow** — DB-editable via admin UI, or markdown files in repo synced to DB? The existing `nerd_skills` table syncs from GitHub per the April-08 memory — decide if new skills follow the same pattern or go DB-native.
3. **Harness enum stability** — are `admin_nerd` / `portal_nerd` / `admin_content_lab` / `portal_content_lab` the final four, or do we leave room for future harnesses (Brain, Analytics, etc.)?
4. **Migration of existing skills** — current `nerd_skills` rows have no scope column. Default everything to `admin_*` scopes only, then Jack curates which flip to portal.

---

## Not in scope (explicitly)

- Renaming internal route paths beyond what was already done — user-visible only.
- Per-skill wizards / modal UIs — slash commands invoke directly, no intermediate step.
- Multiple PDF templates — one template, agency-theme-swapped.
