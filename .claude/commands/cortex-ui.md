# Cortex UI — Shadcn + Bedrock e2e workflow

> **Slash command: `/cortex-ui`** (use this in Cursor/Claude Code — **not** `/bedrock`) so you don’t stack duplicates next to the global **[bedrock](https://github.com/Jacknelson6/bedrock)** React Bits skill, which also registers as `/bedrock`.

> **Versioned in this repo** — [Nativz-Cortex](https://github.com/Jacknelson6/Nativz-Cortex) includes `.claude/skills/bedrock/` (skill id **`cortex-ui-e2e`**) and this command. **Full React Bits source** lives upstream — clone [Jacknelson6/bedrock](https://github.com/Jacknelson6/bedrock) to `~/.claude/skills/bedrock` per its README.

You are running the **Cortex UI (Shadcn + Bedrock)** workflow for this project. Follow it end-to-end.

## Load these (in order)

1. **`.claude/skills/bedrock/SKILL.md`** — main rules (Shadcn blocks first, typography + delight budget, then Bedrock).
2. **`.claude/skills/bedrock/references/design-doctrine.md`** — bold-but-calm design moves, typography, cohesion.
3. If the user wants a **whole page or site in one shot**: **`.claude/skills/bedrock/references/single-prompt-playbook.md`** — run the checklist without skipping verify steps.
4. **`.claude/skills/bedrock/references/shadcn-blocks-pipeline.md`** when adding blocks or running `npx shadcn add`.
5. **`.claude/skills/bedrock/references/composition-with-bedrock.md`** before layering Motion / React Bits.
6. For **in-product Nativz UI**: **`.claude/skills/frontend-patterns/SKILL.md`** and **`docs/detail-design-patterns.md`** as needed.

**Cursor:** **`.cursor/rules/cortex-ui-e2e.mdc`** when working under `app/**` or `components/**`.

## React Bits source (global install)

If **`~/.claude/skills/bedrock/source/reactbits-components.txt`** exists: **grep** for `=== FILE:.*ComponentName` then **Read** only that slice (never the whole file). Otherwise use [reactbits.dev](https://reactbits.dev).

## After building

Run **`npm run build`** and **`npm run lint`** (and fix issues) unless the user only asked for a plan.

## User request

Continue from what the user asked in the message that invoked **`/cortex-ui`**.
