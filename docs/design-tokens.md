# Design Tokens

**Source of truth:** [`app/globals.css`](../app/globals.css) — every token lives there. This doc is the map.
**Aesthetic context:** [`.impeccable.md`](../.impeccable.md) — voice, audience, "what this NEVER looks like."

If a screen feels off-key from the rest of the app, it's almost always because someone reached for raw Tailwind (`bg-slate-900`, `text-gray-400`, `border-zinc-800`) instead of these tokens. **Use tokens. Match the rest of the app.**

---

## 1. The three layers

```
┌─ Brand layer (raw values, rarely referenced directly) ──┐
│   --nz-cyan, --nz-coral, --nz-ink, --nz-ink-2, ...      │
└──────────────────────────────────────────────────────────┘
                          ↓
┌─ Semantic layer (what you reach for in components) ─────┐
│   --background, --surface, --surface-hover, --border,    │
│   --text-primary, --text-secondary, --text-muted,        │
│   --accent, --accent-surface, --accent-text              │
└──────────────────────────────────────────────────────────┘
                          ↓
┌─ Tailwind utilities (auto-generated from @theme inline) ─┐
│   bg-surface, text-text-primary, border-nativz-border,   │
│   bg-accent-surface, text-accent-text, ...               │
└──────────────────────────────────────────────────────────┘
```

The semantic layer flips between brand modes (Nativz dark / Anderson light) at the `[data-brand-mode]` selector. **Components should reference semantic tokens only**, so they re-skin automatically.

---

## 2. Quick reference — what to use when

### Surfaces

| Use | Token | Tailwind | Notes |
|---|---|---|---|
| Page background | `--background` | `bg-background` | The "outside" of cards. |
| Card / panel | `--surface` | `bg-surface` | Default container background. |
| Hover / pressed surface | `--surface-hover` | `bg-surface-hover` | Subtle lift on interaction. |
| Skeleton / inset | `--surface-elevated` | `bg-surface-elevated` | Loading shimmers, masked tracks. |
| Hairline divider | `--border` | `border-nativz-border` | The class is `nativz-border`, not `border` — Tailwind's `border` was already taken. |
| Soft secondary divider | `--border-light` | `border-nativz-border-light` | Inside-card separators. |

### Text

| Use | Token | Tailwind |
|---|---|---|
| Page titles, primary content | `--text-primary` | `text-text-primary` |
| Secondary copy, labels | `--text-secondary` | `text-text-secondary` |
| Captions, helper, "57 events" counts | `--text-muted` | `text-text-muted` |

### Accents

| Use | Token | Tailwind | Reads as |
|---|---|---|---|
| Primary CTA fill | `--accent` | `bg-accent` | Brand cyan (Nativz) / teal (Anderson) |
| CTA hover | `--accent-hover` | `bg-accent-hover` | One shade darker |
| Pill / chip background | `--accent-surface` | `bg-accent-surface` | 12% accent tint |
| Quiet inline highlight | `--accent-text` | `text-accent-text` | Readable accent over dark/light |
| Foreground on filled accent | `--accent-contrast` | `text-accent-contrast` | White on Nativz, navy on Anderson |
| Tertiary categorical tint | `--accent2-*` | `bg-accent2-surface`, `text-accent2-text` | Fuchsia (Nativz) / orange (Anderson) — for badges, status pills, NOT primary CTAs |

### Status

Use these instead of raw Tailwind `emerald-*` / `red-*` / `amber-*`:

| Use | Token | Tailwind |
|---|---|---|
| Success | `--status-success` | `text-status-success` |
| Warning | `--status-warning` | `text-status-warning` |
| Danger / urgency | `--status-danger` | `text-status-danger` (= `--nz-coral`) |
| Info | `--status-info` | `text-status-info` (= `--nz-cyan`) |
| Trending | `--status-trending` | `text-status-trending` |

**Carve-out:** [`components/results/sentiment-split-bar.tsx`](../components/results/sentiment-split-bar.tsx) keeps explicit emerald/red — readability beats brand tint there. Don't generalize.

### Brand colors (rare — prefer semantic)

`bg-nz-cyan`, `bg-nz-coral`, `text-nz-ink-2`, etc. Only reach for these for brand-marked moments (cyan highlighter underline, coral now-line, brand pill chrome). Most screens should use the semantic tokens above so they re-skin under Anderson mode.

### Radii / shadows / motion

| Use | Token |
|---|---|
| Small radius (chip, input) | `--nz-radius-sm` (5px) |
| Default radius (card) | `--nz-radius-md` (10px) |
| Large radius (hero panels) | `--nz-radius-lg` (20px) |
| Pill | `--nz-radius-pill` |
| Button radius (brand-aware) | `--nz-btn-radius` — pill on Nativz, 0 on Anderson |
| Resting shadow | `--shadow-card` (`none` — Nativz is **flat**) |
| Hover lift | `--shadow-card-hover` |
| Modal / dropdown | `--shadow-elevated`, `--shadow-dropdown` |
| Standard easing | `--ease-out-expo` |
| Snappy spring (rare) | `--ease-spring` |
| Durations | `--duration-fast` (150ms), `--duration-normal` (250ms), `--duration-slow` (400ms) |

---

## 3. Typography utilities

The font stack is set via `--font-display` (Jost), `--font-sans` (Poppins/body), `--font-ui` (Rubik), `--font-mono` (Geist Mono).

Reach for these utility classes instead of typing the same `text-3xl font-semibold ...` over and over:

| Class | Use |
|---|---|
| `.ui-page-title` | Default page H1 (text-3xl, display font). Every admin page should land on this. |
| `.ui-page-title-md` | Smaller H1 for embedded/secondary pages. |
| `.ui-page-title-hero` | Marketing-leaning hero. |
| `.ui-section-title` | Section H2 inside a page. |
| `.ui-chrome-title` | Sidebar/breadcrumb dense titles. |
| `.ui-card-title` | Card header (`text-base`, semibold). |
| `.ui-label` | Form labels. |
| `.ui-body` | Default body text inside cards. |
| `.ui-muted` | De-emphasized body. |
| `.ui-caption` | `.text-xs` helper text. |
| `.ui-cal-weekday` | Calendar day-of-week labels. |

### Layout

| Class | Use |
|---|---|
| `.cortex-main` | Wrap on `<main>` — sets default text color + antialiasing for the app shell. |
| `.cortex-page-gutter` | Standard page padding (`p-6 sm:p-8`). Pair with a `max-w-*` to set page width. |

### Brand signature accents

| Class | Use |
|---|---|
| `.nz-u`, `.nz-u-sm` | Cyan highlighter underline behind text — Nativz signature. Use sparingly. |
| `.nz-eyebrow` | Eyebrow label above a section heading. |
| `.nz-btn-pill` | Pill-shaped CTA (Nativz button shape). Brand-mode aware via `--nz-btn-radius`. |
| `.nz-icon-tile` | Square icon tile primitive. |

---

## 4. Recipes — how to build common chrome

### A page

```tsx
<main className="cortex-main">
  <div className="cortex-page-gutter max-w-5xl space-y-8">
    <header className="flex items-start justify-between gap-4">
      <div>
        <h1 className="ui-page-title">Page title</h1>
        <p className="text-sm text-text-muted">One-line subhead.</p>
      </div>
      <Button>Primary action</Button>
    </header>
    {/* content */}
  </div>
</main>
```

### A card

```tsx
<section className="rounded-xl border border-nativz-border bg-surface p-4">
  <h2 className="ui-card-title mb-3">Card title</h2>
  <p className="text-sm text-text-secondary">Body copy.</p>
</section>
```

For headered cards (like `team-availability.tsx`):

```tsx
<section className="rounded-xl border border-nativz-border bg-surface overflow-hidden">
  <header className="flex items-center justify-between border-b border-nativz-border px-4 py-3">
    <h2 className="text-sm font-semibold text-text-primary">Header</h2>
    {/* trailing actions */}
  </header>
  {/* body */}
</section>
```

### A pill / chip

```tsx
<span className="inline-flex items-center gap-1.5 rounded-full bg-accent-surface px-2 py-0.5 text-[11px] text-accent-text">
  Label
</span>
```

For status-tinted pills, swap `bg-accent-surface text-accent-text` for `bg-status-info/10 text-status-info` etc.

### A primary CTA

```tsx
<Link className="inline-flex items-center gap-2 rounded-md bg-accent-text px-3 py-2 text-sm font-semibold text-background hover:opacity-90">
  Action
</Link>
```

(Note: `bg-accent-text text-background` is the established Cortex CTA pattern — readable on dark, doesn't compete with the cyan brand color which is reserved for highlighter underlines and current-time indicators.)

### A secondary / ghost button

```tsx
<button className="inline-flex items-center gap-2 rounded-md border border-nativz-border px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors">
  Action
</button>
```

---

## 5. Anti-patterns

These are the recurring drift signatures across the app. **Don't do them.**

- ❌ Raw Tailwind color utilities for chrome (`bg-slate-900`, `text-gray-400`, `border-zinc-800`). Use the semantic tokens above so Anderson mode + Nativz mode both work.
- ❌ Pure white/black text (`text-white`, `text-black`). Use `text-text-primary` / `text-foreground`.
- ❌ Side-stripe borders > 1px (`border-l-4 border-red-500`). The single most identifiable AI-design tell. Use full borders, background tints, or no indicator.
- ❌ Gradient text (`bg-gradient-to-r ... bg-clip-text text-transparent`). Solid colors only.
- ❌ Random radii. Use `rounded-md` / `rounded-lg` / `rounded-xl` (which map to the Nativz radius scale via Tailwind defaults). Brand-aware buttons use `var(--nz-btn-radius)`.
- ❌ Resting drop shadows on cards. Nativz cards are **flat at rest**. Shadows appear on hover, in dropdowns, and on modals — see `--shadow-*`.
- ❌ Inventing a new card chrome for a new screen. Reach for the recipes above first.

---

## 6. Brand mode (Nativz vs Anderson)

The app supports two visual modes via `data-brand-mode="anderson"` on `<html>`. The semantic tokens (`--surface`, `--accent`, `--text-primary`, ...) all rebind under that selector. **As long as you use semantic tokens, your screen flips automatically.** You only need to think about brand mode when you're hard-coding a brand color (e.g. the Nativz highlighter underline).

Anderson defaults: light mode (paper / navy), teal accent (`#36D1C2`), orange secondary, sharp rectangle buttons (radius 0). Search [`app/globals.css`](../app/globals.css) for `[data-brand-mode="anderson"]` to see the override block.

---

## 7. When tokens are missing

If you reach for a token that doesn't exist (e.g. you need a "warning surface tint" and `--status-warning-surface` isn't there), **add it to `app/globals.css` rather than inlining a one-off color**. Update both the `:root` block (Nativz dark) and the `[data-brand-mode="anderson"]` block (Anderson light), and add a Tailwind-utility line in the `@theme inline` block if it's color-shaped.

That keeps the system load-bearing instead of letting drift accrete.
