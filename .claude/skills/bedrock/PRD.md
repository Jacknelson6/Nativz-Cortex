# PRD: Bedrock + Shadcn — E2E marketing & app UI from one prompt

## Summary

Extend the **Bedrock** skill (animated UI via React Bits / Motion / GSAP / Three) so agents reliably ship **complete pages or mini-sites** by **composing open-source Shadcn blocks first**, then **layering Bedrock motion** only where it earns its cost. The outcome is a **single cohesive agent workflow** that works in **Nativz Cortex** and any Next.js + Tailwind project with `components.json`.

## Problem

- **Bedrock alone** optimizes for motion and React Bits components; it does not prescribe **page shells, dashboards, forms, or marketing section composition** from a maintained block library.
- **Shadcn** (and registries like [ui.shadcn.com/blocks](https://ui.shadcn.com/blocks)) provides **production layouts** but little opinion on **motion hierarchy** or **anti-AI-slop composition**.
- Users want **one prompt** to mean: *route(s) + layout + sections + polish + verify*, not a generic hero pasted from training data.

## Goals

1. **Hybrid default**: Shadcn (structure, accessibility, forms, dashboards) + Bedrock (selective motion, backgrounds, text drama).
2. **Open-source first**: Prefer **official Shadcn blocks** and **documented public registries**; optional **Shadcn Studio** registries already in repo `components.json` (`@ss-blocks`, `@ss-components`, `@ss-themes`).
3. **One-prompt playbook**: A **checklisted** flow the agent follows without skipping: detect project → add blocks → wire routes → token alignment → motion pass → build/lint.
4. **Progressive disclosure**: Large catalogs live in `references/*.md`; `SKILL.md` stays scannable.

## Non-goals

- Vendoring entire React Bits source into this repo (keep using `~/.claude/skills/bedrock/source/` or [reactbits.dev](https://reactbits.dev)).
- Replacing Nativz **product** design tokens for internal admin/portal pages without explicit user ask.
- Guaranteeing **Pro-only** Shadcn Studio blocks without a license (document Free vs Pro; CLI will fail clearly).

## Personas

- **Agent (Claude/Cursor)**: Needs unambiguous **when-to-use-what** and **commands** that work on this stack (Next 15, Tailwind v4, App Router).
- **Human developer**: Wants **PRD + skill** in-repo for review and iteration.

## Functional requirements

| ID | Requirement | Acceptance |
|----|----------------|------------|
| F1 | Skill documents **official Shadcn blocks** entry points and `npx shadcn add` patterns | Agent can add a named block without guessing URLs |
| F2 | Skill documents **repo `components.json` registries** (`@ss-*`) | Agent can run `npx shadcn add @ss-blocks/...` when appropriate |
| F3 | **Composition rules**: Shadcn for shell/sections; Bedrock for motion/ambient | Decision table in SKILL + `references/composition-with-bedrock.md` |
| F4 | **Single-prompt playbook** | Ordered checklist in `references/single-prompt-playbook.md`; summarized in SKILL |
| F4b | **Design doctrine** | `references/design-doctrine.md` — typography-first, delight budget, cohesion; bold moves without overwhelm; Cursor rule + AGENTS hook |
| F5 | **Nativz alignment** | When editing Cortex: cross-link `frontend-patterns` + `docs/detail-design-patterns.md`; map semantic tokens (`bg-surface`, `accent-text`, sentence case) |
| F6 | **Verification** | Playbook ends with `npm run build`, `npm run lint`, optional dev smoke |
| F7 | **Gotchas** | SSR/`'use client'`, `next/image` remotePatterns, avoid duplicate `cn()` stacks, token drift after `shadcn add` |

## Open-source scope (explicit)

- **shadcn/ui** components and **blocks** from the official registry and docs.
- **Shadcn Studio** resources reachable via **public/free** CLI registry JSON (subject to their terms); Pro blocks behind license are optional.
- **React Bits** as the Bedrock motion catalog (same as global Bedrock skill).

## Success metrics (qualitative)

- Agent produces a **multi-section page** with **real block file structure** (not one giant component).
- Motion is **sparse and purposeful** (per Bedrock anti-pattern gallery).
- Build completes without the user fixing missing primitives (`Button` vs radix, etc.) when playbook was followed.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Tailwind v4 + shadcn drift | Playbook: run CLI with project `components.json`; fix imports; prefer block output that matches `app/globals.css` variables |
| Two design systems clash | Rule: **adapt** generated class names to project tokens where Cortex; for greenfield marketing sites, pick one primary token set |
| Context size | Never read huge Bedrock source files whole; grep + offset (inherited rule) |

## Rollout

- [x] Add `.claude/skills/bedrock/` in repo: `SKILL.md`, `PRD.md`, `references/*`.
- [x] Skill id **`cortex-ui-e2e`** (not `bedrock`) + slash **`/cortex-ui`** — avoids duplicate `/bedrock` entries in Cursor next to global [Jacknelson6/bedrock](https://github.com/Jacknelson6/bedrock).
- [ ] (Optional) Install **upstream** Bedrock for full React Bits corpus: [github.com/Jacknelson6/bedrock](https://github.com/Jacknelson6/bedrock) → `~/.claude/skills/bedrock`.
- [ ] (Optional) Add `lib/utils.ts` + `clsx`/`tailwind-merge` if shadcn CLI requires `cn` (project hygiene).

## References

- **Bedrock (upstream skill):** [github.com/Jacknelson6/bedrock](https://github.com/Jacknelson6/bedrock)
- [Shadcn blocks](https://ui.shadcn.com/blocks)
- [Shadcn installation (Next)](https://ui.shadcn.com/docs/installation/next)
- [Shadcn Studio MCP / onboarding](https://shadcnstudio.com/mcp/onboarding) (optional IDE integration)
- [React Bits](https://reactbits.dev)
