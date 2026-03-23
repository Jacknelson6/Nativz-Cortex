# Design Harness

Ship design without being a designer. A 4-layer system for AI-assisted design that combines borrowed expertise, design surfaces, taste training, and implementation doctrine.

Based on [Neethan Wu's "Design Without Designing"](https://x.com/neethanwu/status/2034786360356204934) + [Northstone App UI](https://github.com/Jacknelson6/northstone-app-ui) doctrine.

## The 4 Layers

### Layer 1: Skills (Borrowed Expertise)
Install design skills into your AI agent. They transfer someone else's taste into your workflow.

| Skill | By | What it does |
|-------|----|-------------|
| [Impeccable](https://impeccable.style) | @pbakaus | 20+ commands (`/audit`, `/delight`, `/polish`). Catches AI-generated anti-patterns. |
| [Emil Kowalski](https://emilkowal.ski/skill) | @emilkowalski | Animations and UI polish from the Linear/Vercel design engineer. |
| [Interface Design](https://interface-design.dev) | @Dammyjay93 | Persistent design specs between sessions. Solves the "agent forgets" problem. |
| [UI Skills](https://ui-skills.com) | @ibelick | 15 open-source skills: baseline UI, accessibility, motion, metadata. |
| [Northstone App UI](https://github.com/Jacknelson6/northstone-app-ui) | @jackhnelson | Shadcn-first pipeline + typography doctrine + delight budgets. |

### Layer 2: Agent Canvases (Design Surfaces)
Design tools that use YOUR agent as the brain. The canvas is the shell; Claude Code, Codex, or Cursor is the kernel.

| Canvas | What it is |
|--------|-----------|
| [Paper](https://paper.design) | HTML/CSS-native canvas. MCP tools with read/write. Design-as-code. |
| [Pencil](https://pencil.dev) | Git-diffable `.pen` format. Agent swarm mode (up to 6 agents on one canvas). |

### Layer 3: Inspiration (Training the Eye)

| Tool | What it is |
|------|-----------|
| [Variant](https://variant.ai) | AI design generator. Style Dropper absorbs visual DNA and transfers it. Export as React. |
| [Mobbin](https://mobbin.com) | Curated real app UI patterns. How top apps handle onboarding, settings, checkout. |
| [Awwwards](https://awwwards.com) | Jury-scored cutting-edge web design. The highest bar. |
| [Cosmos](https://cosmos.so) | Collect and explore inspiration. Hex color search, vague description search. |

### Layer 4: Implementation Doctrine
The build layer. Typography-first design, delight budgets, Shadcn skeleton, Bedrock motion rules, and a shipping checklist.

**Delight budget:** 1 hero moment + 1 mid-page + 1 footer motion. That's it. Calm sections make the surprise land.

**Hard bans:** No magnetic hovers. No animate-pulse decoration. No gradient sludge.

**Shipping phases:** Design lock → Shadcn skeleton → Tokens → Motion pass → Cohesion → Verify → Ship.

## Install

**Claude Code:**
```bash
git clone https://github.com/Jacknelson6/design-harness.git ~/.claude/skills/design-harness
```

**Cursor:**
```bash
git clone https://github.com/Jacknelson6/design-harness.git ~/.claude/skills/design-harness
cp ~/.claude/skills/design-harness/cursor-rule.sample.mdc .cursor/rules/design-harness.mdc
```

**OpenClaw:**
```bash
git clone https://github.com/Jacknelson6/design-harness.git ~/.openclaw/skills/design-harness
```

## Contents

| Path | Purpose |
|------|---------|
| `SKILL.md` | Full skill (read first) |
| `cursor-rule.sample.mdc` | Cursor IDE rule with quick reference |

## Related Skills

| Skill | What it adds |
|-------|-------------|
| [web-design-system](https://github.com/Jacknelson6/web-design-system) | CSS/Tailwind techniques: ring technique, Inter variable, split hero, well containers |
| [northstone-app-ui](https://github.com/Jacknelson6/northstone-app-ui) | Shadcn + Bedrock full implementation with source references |
| [bedrock](https://github.com/Jacknelson6/bedrock) | React Bits motion component catalog |

## License

MIT
