---
name: design-harness
description: "Set up and run a complete design workflow for non-designers using AI agents. Four layers: design skills (borrowed expertise), agent canvases (design surfaces), inspiration tools (training taste), and implementation doctrine (shipping with Shadcn + motion). Trigger when: setting up a design workflow, choosing design tools for agents, wanting to 'design without being a designer', asking 'how should I approach design with AI', improving design taste, evaluating design skills/plugins, building landing pages or marketing sites with polished UI, or shipping full pages end-to-end. Based on Neethan Wu's 'Design Without Designing' harness + Northstone App UI doctrine. For specific CSS/Tailwind design techniques, see web-design-system skill."
---

# Design Harness

Four-layer system for shipping design without being a designer. Each layer solves a different problem.

## Layer 1: Skills (Borrowed Expertise)

Design skills are instruction files installed into your AI agent. They transfer someone else's design expertise into your workflow.

### Recommended Skills (ranked by daily usefulness)

**Impeccable** — impeccable.style (by @pbakaus, creator of jQuery UI)
- 20+ commands: `/audit`, `/polish`, `/animate`, `/typeset`, `/arrange`, `/delight`
- Catches the anti-patterns that make AI-generated UI obvious: overused fonts, gray-on-color text, pure blacks, nested cards
- `/delight` is the standout command. Use it frequently, it introduces visual upgrades that change how output looks overnight.
- Most-used skill in this harness.

**Emil Kowalski's Design Engineer Skill** — emilkowal.ski/skill (by @emilkowalski, Linear/Vercel)
- Created by the maker of Sonner and Vaul (15M+ weekly npm downloads)
- Encodes how he thinks about animations, UI polish, and small details most people skip
- Free version borrows his mindset. Full version comes with animations.dev course.

**Interface Design** — interface-design.dev (by @Dammyjay93)
- Solves the biggest problem: agent forgets design decisions between sessions
- Stores specs (spacing grids, color palettes, depth strategies, component patterns) in a persistent system.md that loads automatically
- Critical for multi-session consistency.

**UI Skills** — ui-skills.com (by @ibelick, creator of motion-primitives)
- 15 open-source skills: baseline UI, accessibility, motion, performance, metadata
- Solid foundation for broad coverage, use as a baseline layer.

**Northstone App UI** — github.com/Jacknelson6/northstone-app-ui
- Shadcn-first React/Next.js shipping: blocks pipeline, typography doctrine, delight budgets
- Includes single-prompt E2E playbook for shipping full pages in one go
- Pairs with Bedrock (github.com/Jacknelson6/bedrock) for React Bits motion components
- Install: `git clone https://github.com/Jacknelson6/northstone-app-ui.git ~/.Codex/skills/northstone-app-ui`

### Gotchas
- Install Impeccable first, it has the highest immediate impact
- Interface Design's persistent system.md is essential for multi-session projects
- Skills stack: using all together gives broader coverage than any one alone
- Run `/audit` before shipping anything. It catches embarrassing mistakes.

## Layer 2: Agent Canvases (Design Surfaces)

Canvases are design tools that use YOUR agents as the kernel. The canvas is the shell, your agent (Codex, Codex, etc.) is the brain.

**Paper** — paper.design (by @paper)
- Canvas built on real HTML and CSS, not proprietary format. What you design IS code.
- Exposes MCP tools with full read/write access. Works with local agents out of the box.
- Best for: design systems, design tokens, page design iterations
- Use as source of truth and design reference alongside building the product.
- Free tier with limited MCP call quotas.

**Pencil** — pencil.dev (by @tomkrcha)
- JSON-based `.pen` format. Git-diffable and agent-manipulable via MCP.
- Design files sit in your repo, versioned like code.
- **Swarm mode**: Spin up multiple agents (up to six) on your canvas simultaneously. One handles typography, another does layout, a third propagates the design system.
- Currently free. Use alongside Paper.

### When to use which
- Paper: when you want design-as-code (HTML/CSS output). Good for design systems.
- Pencil: when you want versioned design files in your repo. Good for collaborative agent work.

## Layer 3: Inspiration (Training the Eye)

Skills give expertise. Canvases give a surface. But you still need to know what good looks like.

**Variant** — variant.ai (by @variantui)
- Type an idea, scroll through endless non-repeating design interpretations
- **Style Dropper**: Point at any design, it absorbs the visual DNA (color palette, typographic rhythm, spatial density) and transfers it onto another design
- Export as React, copy prompts with HTML references for coding agents
- Use for 20 min/day to warm up before design work. Becomes part of the daily routine.

**Mobbin** — mobbin.com (by @mobbin)
- Curated real app UI patterns (mobile + web)
- Use when you need to see how top apps handle specific flows: onboarding, settings, checkout, etc.
- Has a Figma plugin for pulling references directly.

**Awwwards** — awwwards.com (by @awwwards)
- Jury-scored cutting-edge web design. The highest bar for web craft.

**Cosmos** — cosmos.so (by @thecosmos)
- Collect inspiration and explore others' collections. Web design, typography, interiors, photography.
- Hex color search and vague description search find surprisingly relevant results.
- Use to build clusters of visual references that shape how you think about design.

## Layer 4: Implementation Doctrine (Shipping It)

The first three layers handle taste, tools, and surfaces. This layer handles the actual build, from typography lock to final verification. Based on the Northstone App UI doctrine and Shadcn blocks pipeline.

### Design Doctrine (read before writing JSX)

**Typography carries the brand (60% of "premium"):**
- Lock a font pairing early: display + body, or serif headline + sans UI
- Scale with intent: fewer sizes, clearer hierarchy. Hero → section title → body → caption
- Headlines can be tight tracking, body max ~65ch
- **Bold move (pick ONE per page):** oversized hero type OR a stark type-only section OR one typographic animation. Not three.

**Delight budget (surprise without fatigue):**

| Budget | Allowed |
|--------|---------|
| 1× hero | Strong typographic treatment, SplitText entrance, single ambient background, or asymmetric layout |
| 1× mid-page | Scroll reveal on ONE section, or a non-cursor-chasing micro-motion (gentle fade-in) |
| 1× footer/social proof | Logo loop, marquee, or quiet motion at low frequency |
| NOT allowed on one page | Multiple WebGL backgrounds + parallax + grain + sparkles + gradient text everywhere |

**Surprise = contrast with calm.** Calm sections make the one animated section feel designed, not busy.

**Hard bans:**
- No magnetic hovers (Magnet, MagnetLines, or any cursor-pull effects). They read as gimmicky.
- No `animate-pulse` decoration everywhere
- No purple-blue gradient sludge

### Shadcn Blocks Pipeline

Use Shadcn blocks as the skeleton for any page:
1. Prefer `npx shadcn@latest add <block>` for dashboards, sidebars, auth, marketing sections
2. Adapt blocks to ONE system: same radius, same border language, same button weight across sections
3. If missing `cn`/utils: add `lib/utils.ts` with `clsx` + `tailwind-merge`

### Motion Rules (Bedrock/React Bits)

Motion is seasoning, not the main course:
- At most ONE strong ambient background per page (hero or footer only)
- Hero "moment" must not fight typography
- Use `motion/react` (not `framer-motion`) per Bedrock convention
- `'use client'` on motion leaves, `dynamic(..., { ssr: false })` for Three.js/WebGL
- **When to add motion:** staggered headlines, one ambient background, logo strips, scroll-wrapped cards
- **When NOT to add motion:** dashboards, settings, dense tables, or when it would replace clear typography

### Single-Prompt Shipping Checklist

When building a full page in one go:

```
Phase 0   — Confirm scope (marketing vs dashboard vs auth)
Phase 0.5 — Design lock: font pairing, delight budget, what stays calm
Phase 1   — Skeleton: list sections, pick Shadcn blocks, scaffold routes
Phase 2   — Tokens: apply project design system or CSS variables
Phase 3   — Motion pass: at most 1 hero moment + 1 optional mid-page
Phase 3.5 — Cohesion: strip weakest effect if >2 "wow" layers, unify radii
Phase 4   — Content & assets: real copy, next/image, metadata
Phase 5   — Verify: npm run build, npm run lint, dev smoke test
Phase 6   — Handoff: summarize blocks used, file map, follow-ups
```

### Composition Checks (Before Ship)
- [ ] Can I describe the page in one sentence (audience + promise)?
- [ ] Is there one clear focal point above the fold?
- [ ] Did I use more than two "special effects"? If yes, remove the weakest.
- [ ] Does mobile simplify (same hierarchy, less decoration)?
- [ ] Would this still look good without animation? (If no, fix type/spacing first.)

## The Workflow

1. **Warm up** (10-20 min): Browse Variant, Mobbin, or Cosmos. Save anything that catches your eye.
2. **Set the foundation**: Run Interface Design to load/create your persistent design specs.
3. **Design lock**: Lock font pairing, delight budget, and what stays calm (Layer 4 doctrine).
4. **Design in canvas**: Open Paper or Pencil. Point your agent at it via MCP. Describe what you want.
5. **Build the skeleton**: Shadcn blocks pipeline. One block per section, adapt to one visual system.
6. **Polish with skills**: Run Impeccable `/audit` then `/delight`. Apply Emil's polish pass.
7. **Motion pass**: One hero moment, one optional mid-page. Bedrock/React Bits if using React.
8. **Cohesion pass**: Strip competing effects, unify radii/borders/buttons, simplify mobile.
9. **Verify and ship**: Build, lint, smoke test. Run `/audit` one final time.

## Related Skills
- **web-design-system**: Specific CSS/Tailwind techniques (ring technique, Inter variable, split hero, well containers). This skill is "what tools + workflow", that skill is "what CSS techniques".
- **northstone-app-ui**: Full Shadcn + Bedrock implementation skill with source references. Install separately for component source access.
- **bedrock**: React Bits motion component catalog. Install separately: `git clone https://github.com/Jacknelson6/bedrock.git ~/.Codex/skills/bedrock`
