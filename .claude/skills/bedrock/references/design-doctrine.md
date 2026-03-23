# Design doctrine — bold, cohesive, surprisingly delightful (not overwhelming)

Use this **before** writing JSX. Agents in **Cursor** or Claude Code should treat this as the taste layer on top of the Shadcn pipeline.

## North star

Ship sites that feel **intentionally designed**: a clear typographic voice, confident spacing, and **one or two moments** where the user thinks “that’s nice” — without sensory overload.

## 1. Typography carries the brand (60% of “premium”)

- **Lock a pairing early** (display + body, or serif headline + sans UI). Pull recipes from upstream Bedrock `references/typography-recipes.md` if available, or choose from [Google Fonts](https://fonts.google.com) / `next/font` with a **reason** (e.g. editorial SaaS → serif display; dev tool → mono accents only for labels).
- **Scale with intent:** Fewer sizes, clearer hierarchy. Hero → section title → body → caption; avoid six competing `text-xl`s.
- **Tracking and line length:** Headlines can be tight; body max ~65ch. Delight often lives in **rhythm**, not effects.
- **Bold move (pick one per page):** oversized hero type **or** a stark type-only section **or** one typographic animation — not three.

## 2. Shadcn = skeleton, fit, and trust

- Use **blocks** for dashboards, auth shells, sidebars, pricing tables, FAQs — they read as **product**, not demo.
- **Adapt blocks to one system:** Same radius family, same border language, same button weight across sections. If shadcn outputs `rounded-md` everywhere but you want `rounded-2xl` on marketing, **standardize in one pass** (don’t mix five radii).
- **Nativz in-app surfaces:** align to `frontend-patterns` (sentence case, `bg-surface`, `accent-text`). **Standalone marketing** in this repo may use CSS variables from `globals.css` consistently instead of random hex.

## Hard bans (Northstone App UI — non-negotiable)

- **No magnetic hovers** — Do **not** use React Bits **Magnet**, **MagnetLines**, or any “element follows cursor / pulls toward pointer” behavior. It reads as gimmicky and hurts calm, confident UI. Prefer static layout + clear hover states (`opacity`, `border`, `scale` ≤1.02, or shadcn defaults).

## 3. Delight budget (surprise without fatigue)

| Budget | Allowed |
|--------|---------|
| **1× hero** | One of: strong typographic treatment / SplitText-style entrance / single ambient background / asymmetric layout |
| **1× mid-page** | Scroll reveal on **one** section, or a **non-cursor-chasing** micro-motion (e.g. gentle fade-in) — **not** magnetic hovers |
| **1× footer or social proof** | Logo loop, marquee, or quiet motion — **low** frequency |
| **Not allowed in one page** | Multiple WebGL backgrounds + parallax + grain + sparkles + gradient text everywhere |

**Surprise = contrast with calm:** Calm sections make the one animated section feel **designed**, not busy.

## 4. Component choices that “fit”

- **Match energy to content:** Pricing = clear and stable; hero = expressive; docs = restrained.
- **Prefer one motion library surface per subtree:** Motion (`motion/react`) **or** a Bedrock component — avoid fighting springs.
- **Don’t stack gimmicks:** Spotlight cards are great; **every** card spotlight = noise. Use **default** shadcn cards for dense grids; reserve polish for **one** row.

## 5. Composition checks (before ship)

- [ ] Can I describe the page in **one sentence** (audience + promise)?
- [ ] Is there **one** clear focal point above the fold?
- [ ] Did I use **more than two** “special effects”? If yes, remove the weakest.
- [ ] Does mobile **simplify** (same hierarchy, less decoration)?
- [ ] Would this still look good **without** animation? (If no, fix type/spacing first.)

## 6. E2E flow reminder

Structure → type lock → content → **one** delight pass → build/lint. See **`single-prompt-playbook.md`** for ordered phases.
