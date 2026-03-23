# Composition: Shadcn blocks vs Bedrock (React Bits) motion

See **`design-doctrine.md`** first for typography leadership, delight budget, and cohesion — this file is the **mechanical** split between libraries.

## Default strategy

| Layer | Use | Why |
|-------|-----|-----|
| **Layout & sections** | Shadcn **blocks** + primitives | Accessible patterns, maintained structure, fast to ship |
| **Forms & tables** | Shadcn primitives + block patterns | Focus rings, labels, validation hooks |
| **Navigation** | Shadcn `sidebar`, `navigation-menu`, block shells | Consistent IA |
| **Motion & atmosphere** | Bedrock / React Bits | Text reveals, ambient backgrounds, scroll choreography |
| **One-off polish** | Motion (`motion/react`) small wrappers | When no catalog component fits |

## When to use Bedrock on top of Shadcn

**Do add Bedrock when:**

- Hero needs **staggered headline** (e.g. SplitText) but **CTA/layout** stays shadcn `Button` + grid.
- You want **one** ambient background (Aurora, Particles, LightRays) for the **hero or footer only** — not every section.
- **Logo strip** or **social proof** needs LogoLoop / subtle motion.
- **Scroll storytelling**: AnimatedContent / FadeContent wrapping **existing** shadcn cards.

**Do not add Bedrock when:**

- A static shadcn block already communicates hierarchy (dashboards, settings, dense tables).
- You would stack **multiple** WebGL backgrounds on one page.
- Motion replaces **clear typography** — fix fonts and spacing first (see global Bedrock `style-profiles.md` if available).

## File structure (recommended)

```
app/(marketing)/page.tsx          # Server: compose sections
components/marketing/
  hero-section.tsx                # client — shadcn + optional Bedrock
  features-section.tsx            # client or server chunks
  pricing-section.tsx
components/ui/                    # shadcn primitives
```

Avoid a **single 800-line page**; blocks should map to **files** matching shadcn output.

## Imports

- Bedrock components: copy from **`~/.claude/skills/bedrock/source/reactbits-components.txt`** (grep + read slices) or implement from [reactbits.dev](https://reactbits.dev).
- Use **`motion/react`**, not `framer-motion`, per global Bedrock rules.
