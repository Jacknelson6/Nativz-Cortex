# Shadcn blocks pipeline (open source + Studio registries)

Use this when scaffolding **pages, dashboards, auth layouts, or marketing sections** before adding Bedrock motion.

## Official Shadcn (always allowed)

- **Blocks gallery**: [ui.shadcn.com/blocks](https://ui.shadcn.com/blocks) — dashboards, sidebars, login, calendar shells, chart layouts, etc.
- **Docs**: [ui.shadcn.com/docs](https://ui.shadcn.com/docs) — primitives (`button`, `card`, `dialog`, …).
- **CLI**: `npx shadcn@latest add <name>` — names match docs (e.g. `button`, `card`). For **v4 + registry** blocks, prefer the **exact command** shown on each block’s page (copy from site).

**Rule:** Prefer adding **primitives first** if a block errors (missing `button`, `input`, `label`, `sheet`, etc.), then re-run the block add.

## This repo: `components.json` registries

At project root, `components.json` includes:

```json
"registries": {
  "@ss-components": "https://shadcnstudio.com/r/components/{name}.json",
  "@ss-themes": "https://shadcnstudio.com/r/themes/{name}.json",
  "@ss-blocks": "https://shadcnstudio.com/r/blocks/{name}.json"
}
```

**Examples (patterns — verify names on Shadcn Studio site):**

```bash
npx shadcn@latest add @ss-themes/claude
npx shadcn@latest add @ss-blocks/<block-slug-from-studio>
npx shadcn@latest add @ss-components/<component-slug-from-studio>
```

Studio catalog browsing: [shadcnstudio.com/blocks](https://shadcnstudio.com/blocks) / components / theme generator. **Pro** items require a license; **free** tier still useful for structure.

## Next.js App Router wiring

1. **Route**: Add `app/<segment>/page.tsx` (and `layout.tsx` if needed).
2. **Imports**: Blocks usually land under `components/` — fix paths to `@/components/...` per project aliases.
3. **`'use client'`**: Any interactive or motion-heavy subtree must be a client component or split into a child client file.
4. **`next/image`**: If block uses remote images, add `remotePatterns` in `next.config.ts` (e.g. Unsplash, Figma MCP localhost — see project config).

## After `shadcn add` (Nativz Cortex)

- Replace generic `bg-background` / gray text with **project semantics** where the page is **in-product**: `bg-surface`, `text-text-primary`, `accent-text`, `border-nativz-border` (see `frontend-patterns` skill).
- **Sentence case** copy (product UI).
- For **standalone marketing microsites** inside the repo, you may keep shadcn default tokens **if** `globals.css` CSS variables already map consistently — avoid mixing two unrelated palettes on one page.

## Dependency hygiene

If CLI reports missing `cn`:

- Add `lib/utils.ts` with `clsx` + `tailwind-merge` **or** run `npx shadcn@latest init` and merge carefully with existing `components/ui`.
