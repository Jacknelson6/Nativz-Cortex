# Single-prompt E2E ship — agent checklist

Use this when the user asks to **build a full landing page, marketing site, or app shell** in **one go** (or one thread).

## Phase 0 — Intent (30 seconds)

- [ ] Confirm **scope**: single route vs multi-route; **marketing** vs **dashboard** vs **auth**.
- [ ] Confirm **brand**: reuse Nativz tokens vs standalone microsite palette.
- [ ] Skim **`components.json`** — note `registries` and `aliases`.

## Phase 0.5 — Design lock (before any structure)

Read **`design-doctrine.md`**. Then commit on paper (or in a short comment at top of `page.tsx`):

- [ ] **One-sentence positioning** for the page (who it’s for + what it promises).
- [ ] **Font pairing + loading plan** (`next/font` names and weights).
- [ ] **Delight budget**: which **one** hero surprise and which **optional** second moment (if any).
- [ ] **What stays calm** (most sections should be “quiet” so the surprise lands).

Do **not** start with animation or backgrounds before this lock.

## Phase 1 — Skeleton (structure before motion)

- [ ] List **sections** (e.g. hero, logos, features, pricing, FAQ, CTA, footer).
- [ ] For each section, pick **one** primary source:
  - **Official Shadcn block** (dashboard, login, sidebar, marketing-style blocks from [blocks](https://ui.shadcn.com/blocks)), or
  - **`@ss-blocks/...`** from Studio registry if it matches exactly, or
  - **Primitives only** if no block fits.
- [ ] Run **`npx shadcn@latest add ...`** for the block(s) and any missing primitives.
- [ ] Create **`app/.../page.tsx`** (+ `layout.tsx`) and **import** generated components; **split** client boundaries.

## Phase 2 — Nativz Cortex product alignment (if paths are under admin/portal)

- [ ] Apply **`frontend-patterns`** skill: dark surfaces, `accent-text`, sentence case.
- [ ] Cross-check **`docs/detail-design-patterns.md`** for micro-interactions that match the feature.

## Phase 3 — Bedrock motion pass (sparse)

- [ ] Read **`references/composition-with-bedrock.md`**.
- [ ] **At most one** strong ambient background for the whole page (or hero only).
- [ ] **One** “hero moment” aligned with Phase 0.5 (e.g. SplitText OR bold background — not both fighting).
- [ ] Grep global Bedrock source for components; **never read full `reactbits-components.txt`**.
- [ ] **`'use client'`** on motion leaves; **`dynamic(..., { ssr: false })`** for Three.js/WebGL.

## Phase 3.5 — Cohesion pass (surprising but not overwhelming)

- [ ] **Strip** the weakest effect if more than **two** “wow” layers compete (e.g. grain + parallax + split text + aurora).
- [ ] **Unify** radii, borders, and button styles across shadcn sections.
- [ ] **Mobile:** remove or simplify motion that hurts readability; keep typographic hierarchy obvious.

## Phase 4 — Content & assets

- [ ] **Copy**: concrete headlines (no lorem for final user-facing strings if spec provided).
- [ ] **Images**: `next/image` + **`remotePatterns`** in `next.config.ts` for remote hosts.
- [ ] **Metadata**: `metadata` / `generateMetadata` for public routes.

## Phase 5 — Verify

- [ ] `npm run build`
- [ ] `npm run lint` (and `npx tsc --noEmit` if project uses it cleanly)
- [ ] Quick **dev smoke**: load `/your-route`, mobile width check.

## Phase 6 — Handoff

- [ ] Short summary: **which blocks** were added, **which files** own each section, **where motion** lives.
- [ ] Note **follow-ups**: CMS wiring, analytics, A/B, i18n.

## Failure recovery

| Symptom | Action |
|---------|--------|
| Missing `cn` / utils | Add `lib/utils.ts` + deps or `shadcn init` merge |
| Block import chaos | Align alias `@/components`; fix barrel exports |
| Hydration errors | Move motion/WebGL to client leaf + dynamic |
| Style clash | Strip extra gradients; revert to shadcn layout + one motion layer |
