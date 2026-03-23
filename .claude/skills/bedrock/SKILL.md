---
name: cortex-ui-e2e
description: >
  Nativz Cortex: full React/Next.js UI shipping — Shadcn blocks + typography-first design doctrine + selective Bedrock/React Bits motion. Use for landing pages, marketing sites, e2e multi-section flows, app shells, dashboards, "ship the whole site in one prompt."
  In Cursor use slash command /cortex-ui (NOT /bedrock — that name is reserved for the global Jacknelson6/bedrock React Bits skill to avoid duplicate menu entries).
  Trigger on: cortex-ui, shadcn pipeline, e2e UI, bold typography, delightful cohesive design, premium landing, greenfield pages, composable blocks, React Bits layered on shadcn.
  Always read references/design-doctrine.md and references/single-prompt-playbook.md for e2e ships.
  For React Bits source, NEVER read full ~/.claude/skills/bedrock/source/*.txt files — grep for component delimiters then Read with offset+limit (max ~300 lines), or use reactbits.dev.
---

# Cortex UI e2e — Shadcn + Bedrock

> **Cursor / slash command:** Use **`/cortex-ui`** for this workflow. Do **not** register a second skill named `bedrock` here — the global **[bedrock](https://github.com/Jacknelson6/bedrock)** skill already owns **`/bedrock`** (React Bits catalog). This skill’s id is **`cortex-ui-e2e`**.

> **Canonical motion skill (upstream):** **[github.com/Jacknelson6/bedrock](https://github.com/Jacknelson6/bedrock)** — React Bits source (`source/`), category references, templates, scripts. Install globally:
> `git clone https://github.com/Jacknelson6/bedrock.git ~/.claude/skills/bedrock`
>
> **This folder (Nativz Cortex)** extends that workflow with **Shadcn blocks + single-prompt playbook**; it does **not** duplicate the large `source/*.txt` files.

> **Product intent:** One coherent workflow — **Shadcn (open blocks + primitives) for the skeleton**, **Bedrock/React Bits for motion where it earns the complexity**. See **`PRD.md`** in this folder for goals, requirements, and risks.

## Read first (pick by task)

| Situation | File |
|-----------|------|
| **Taste: bold type, delight budget, cohesion** | **`references/design-doctrine.md`** — read **before** JSX for e2e sites |
| **“Build the whole page/site in one prompt”** | `references/single-prompt-playbook.md` — **non-skippable checklist** |
| **Adding blocks, CLI, Studio registries** | `references/shadcn-blocks-pipeline.md` |
| **When to animate vs stay static** | `references/composition-with-bedrock.md` |
| **Full PRD / success criteria** | `PRD.md` |
| **Nativz product UI tokens & copy** | `.claude/skills/frontend-patterns/SKILL.md` + `docs/detail-design-patterns.md` |
| **Style profiles, typography, motion theory (global Bedrock)** | [Jacknelson6/bedrock](https://github.com/Jacknelson6/bedrock) → `references/style-profiles.md` or `~/.claude/skills/bedrock/references/` after clone |

## Cursor

- **`.cursor/rules/cortex-ui-e2e.mdc`** — applies when editing `app/**` and `components/**`; restates pipeline + delight budget.
- **`.claude/commands/cortex-ui.md`** — slash **`/cortex-ui`** (distinct from global **`/bedrock`**).
- **`AGENTS.md`** — project-wide reminder to load this skill for full-page / e2e UI work.

## Core rules

1. **Typography before effects**: Lock **font pairing + scale + section rhythm** first (`design-doctrine.md`). Delight should read as **intentional**, not decorative noise.
2. **Blocks before blobs**: Prefer **`npx shadcn@latest add`** for [official blocks](https://ui.shadcn.com/blocks) and repo registries **`@ss-blocks` / `@ss-components` / `@ss-themes`** (see root `components.json`). Compose sections from real files, not one mega-component. **One visual system** across sections (radius, borders, button weight).
3. **Delight budget**: **One** hero-level surprise + **one** optional mid-page or footer motion — see table in `design-doctrine.md`. Calm surrounds make the surprise feel **premium**.
4. **Motion is seasoning**: At most **one** strong ambient background per page; hero “moment” must not fight typography (see `composition-with-bedrock.md`). Inherited Bedrock anti-patterns still apply (no purple-blue gradient sludge, no `animate-pulse` decoration everywhere).
5. **Context discipline**: React Bits source in **`~/.claude/skills/bedrock/source/`** when [Jacknelson6/bedrock](https://github.com/Jacknelson6/bedrock) is installed — **grep** for `=== FILE:` then **Read** a slice; otherwise [reactbits.dev](https://reactbits.dev).
6. **Next.js App Router**: `'use client'` on interactive/motion leaves; **`dynamic(..., { ssr: false })`** for Three/WebGL; align **`next/image`** with `next.config.ts` `remotePatterns`.
7. **Verification**: Playbook ends with **`npm run build`** and **`npm run lint`** (and typecheck if the repo is clean).

## Quick source map (global Bedrock install)

| Need | Where |
|------|--------|
| React Bits component code | `~/.claude/skills/bedrock/source/reactbits-components.txt` |
| React Bits docs / props | `~/.claude/skills/bedrock/source/reactbits-docs.txt` |
| Style profiles, tokens, templates | `~/.claude/skills/bedrock/references/*.md` |

If those paths are missing, install **[Jacknelson6/bedrock](https://github.com/Jacknelson6/bedrock)** into `~/.claude/skills/bedrock/` (see README there), **or** implement from [reactbits.dev](https://reactbits.dev) — do not invent APIs from memory.

## Shadcn open ecosystem (summary)

- **Official**: [ui.shadcn.com/docs](https://ui.shadcn.com/docs) · [blocks](https://ui.shadcn.com/blocks)
- **Studio (optional)**: registry URLs already in **`components.json`**; browse [shadcnstudio.com](https://shadcnstudio.com) for slugs; respect Free vs Pro.
- **MCP (optional)**: [Shadcn Studio MCP onboarding](https://shadcnstudio.com/mcp/onboarding) for IDE-integrated installs — not required for CLI workflow.

## Implementation order (default)

```
1. DOCTRINE  → references/design-doctrine.md (type lock + delight budget)
2. PLAYBOOK  → references/single-prompt-playbook.md (phases 0–0.5 before code)
3. SHADCN    → add blocks/primitives (pipeline doc)
4. ROUTES    → app/.../page.tsx, layouts, client boundaries
5. TOKENS    → frontend-patterns if Cortex product surface
6. BEDROCK   → grep+read React Bits source; layer 1–2 deliberate moments
7. COHESION  → playbook phase 3.5 — strip competing effects, unify system
8. VERIFY    → build + lint (+ smoke)
```

## Gotchas (high signal)

- **`lib/utils.ts` / `cn`**: This repo’s `components.json` expects `@/lib/utils` — if missing, add `cn` + `clsx`/`tailwind-merge` or run `shadcn init` and merge carefully.
- **Duplicate Buttons**: Cortex already has custom `@/components/ui/button` — when mixing shadcn and Cortex, **one primary system per route**; adapt imports or wrap, don’t fork silently.
- **Tailwind v4**: Project uses `app/globals.css` + empty tailwind config string in `components.json` — prefer CLI output that matches existing CSS variables.
- **CSP / images**: Production headers may restrict `img-src`; use allowed hosts or local assets.

## From a GitHub clone

This **Nativz Cortex** repo carries the skill and slash command in git:

- **`.claude/skills/bedrock/`** — SKILL + PRD + `references/` (skill id **`cortex-ui-e2e`**; folder name unchanged for paths).
- **`.claude/commands/cortex-ui.md`** — **`/cortex-ui`** (project-scoped; avoids duplicate **`/bedrock`** entries next to global Bedrock).

No separate install step for those files. For **React Bits source + full references**, clone **[github.com/Jacknelson6/bedrock](https://github.com/Jacknelson6/bedrock)** to `~/.claude/skills/bedrock` (per upstream README).

## Relation to [Jacknelson6/bedrock](https://github.com/Jacknelson6/bedrock) on GitHub

- **Upstream repo** — MIT; `SKILL.md`, `references/`, `templates/`, `source/reactbits-*.txt`, `scripts/`.
- **This Nativz folder** — **Shadcn + E2E playbook + Nativz token notes** only; merge mentally with upstream when both exist.
- **Load order:** Use **this `SKILL.md`** for Shadcn/checklist in Cortex; use **upstream files** for component source and style profiles.
