# Design system

Short, scannable, copy-pasteable. For the full canonical reference (every token, every brand-mode override, every carve-out), see [`docs/design-tokens.md`](docs/design-tokens.md). For micro-interaction patterns (motion choreography, focus states), see [`docs/detail-design-patterns.md`](docs/detail-design-patterns.md).

**Source of truth:** [`app/globals.css`](app/globals.css). Tokens are defined there in three layers: brand → semantic → Tailwind utility (`@theme inline`). Components consume the utility layer; the semantic layer flips between brand modes via `[data-brand-mode]`.

---

## Spacing

Tailwind default scale. Use these specific stops:

| Token | Use for |
|---|---|
| `p-2` / `gap-2` | tight icon + label, badge interior |
| `p-3` / `gap-3` | dense table row, inline form cluster |
| `p-4` / `gap-4` | standard card interior, form field spacing |
| `p-6` / `gap-6` | section padding, dialog body |
| `p-8` / `gap-8` | page chrome, large hero blocks |

**Page gutter:** use the `cortex-page-gutter` utility (defined in `app/globals.css`) for the standard outer page padding. Don't hand-roll `px-6 md:px-8` per page.

**No arbitrary values.** `p-[13px]` style values are banned outside documented carve-outs (user-supplied hex, brand-mode overrides).

---

## Colors

All colors are semantic tokens. Never reach for raw Tailwind palette (`bg-slate-900`, `text-gray-400`). The brand-mode override re-skins everything automatically.

### Surfaces
| Tailwind | Use for |
|---|---|
| `bg-background` | page background (the "outside" of cards) |
| `bg-surface` | default container, card |
| `bg-surface-hover` | hover/pressed state on surface |
| `bg-surface-elevated` | skeleton tracks, inset/masked states |
| `border-nativz-border` | hairline divider |
| `border-nativz-border-light` | inside-card secondary divider |

### Text
| Tailwind | Use for |
|---|---|
| `text-text-primary` | page titles, primary content |
| `text-text-secondary` | labels, secondary copy |
| `text-text-muted` | captions, counts, helper text |

### Accent
| Tailwind | Use for |
|---|---|
| `bg-accent` | primary CTA fill |
| `bg-accent-hover` | CTA hover |
| `bg-accent-surface` | pill/chip background (12% tint) |
| `text-accent-text` | quiet inline highlight |
| `text-accent-contrast` | foreground on filled accent |
| `bg-accent2-surface` / `text-accent2-text` | tertiary categorical tint (badges, NOT CTAs) |

### Status
| Tailwind | Use for |
|---|---|
| `text-status-success` | success states |
| `text-status-warning` | warning |
| `text-status-danger` | danger / urgency |
| `text-status-info` | info |
| `text-status-trending` | trending / momentum |

Use these instead of `text-emerald-500`, `text-red-500`, etc.

### Platform tints
For TikTok / Instagram / YouTube / Facebook / LinkedIn / Google Business surfaces: use `--platform-<name>` CSS variables (see `app/globals.css` lines 123-137). Do not hardcode platform hex.

---

## Typography

Three font families, three roles:

| Class | Family (Nativz) | Family (Anderson) | Use for |
|---|---|---|---|
| `font-display` | Jost | Rubik | hero, marketing headings |
| `font-sans` | Poppins | Roboto | body copy, defaults |
| `font-ui` | Rubik | Rubik | UI labels, table headers, buttons |
| `font-mono` | Geist Mono | Geist Mono | code, IDs, structured data |

Sizes (Tailwind scale):

| Class | Use for |
|---|---|
| `text-xs` (12px) | counts, labels, captions |
| `text-sm` (14px) | dense table cells, secondary copy |
| `text-base` (16px) | body copy default |
| `text-lg` (18px) | card titles |
| `text-xl` (20px) | section headings |
| `text-2xl` (24px) | page titles |
| `text-3xl+` | hero |

**Copy case:** sentence case in product UI. Title Case is reserved for the admin sidebar nav and document/file headings.

---

## Border radii

| Class | Token | Px |
|---|---|---|
| `rounded-sm` | `--nz-radius-sm` | 5 |
| `rounded-md` | `--nz-radius-md` | 10 |
| `rounded-lg` | `--nz-radius-lg` | 20 |
| `rounded-full` | `--nz-radius-pill` | 9999 |

Buttons route through `--nz-btn-radius` (pill in both Nativz and Anderson per visual QA).

---

## Shadows / elevation

Nativz is **flat at rest**. Shadows show on hover or for floating surfaces only.

| Token | Use for |
|---|---|
| `--shadow-card` | resting card (`none`) |
| `--shadow-card-hover` | card hover lift |
| `--shadow-elevated` | dialogs, modals, drawers |
| `--shadow-dropdown` | popovers, menus, tooltips |

Anderson mode softens these to lighter navy-tinted shadows.

---

## Motion

| Token | Value | Use for |
|---|---|---|
| `--duration-fast` | 150ms | hover/focus transitions |
| `--duration-normal` | 250ms | enter/exit, layout changes |
| `--duration-slow` | 400ms | hero reveals, multi-step choreography |
| `--ease-out-expo` | `cubic-bezier(0.16, 1, 0.3, 1)` | default ease (exits, settle) |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | playful enter (pop in) |

---

## Breakpoints

Tailwind defaults — no custom breakpoints.

| Class | Min width |
|---|---|
| `sm:` | 640px |
| `md:` | 768px |
| `lg:` | 1024px |
| `xl:` | 1280px |
| `2xl:` | 1536px |

Admin pages assume `lg:` and up for the sidebar layout; below `lg:` the sidebar collapses. Portal pages should work down to mobile (`sm:` and below).

---

## Z-index

De facto scale (measured from actual usage across `app/` + `components/`):

| Class | Use for | Approx. count |
|---|---|---|
| `z-10` | raised inline content (sticky table headers, anchored badges) | 56 |
| `z-20` | overlay above inline (sidebar drawer mobile, expanding panels) | 14 |
| `z-30` | sticky page header / top nav | 11 |
| `z-40` | popovers, dropdown menus, tooltips | 18 |
| `z-50` | dialogs, toasts, scroll-to-top FAB | 58 |

**Anything above 50 is drift.** The handful of `z-[60]`, `z-[100]`, `z-[9999]` references are bugs to be cleaned up (flagged in `FOUNDATION_AUDIT.md`). Don't add new ones.

---

## Hard rules (mirror of CLAUDE.md)

1. No arbitrary Tailwind values (`p-[13px]`, `text-[#abc]`) outside documented carve-outs.
2. No raw palette colors (`bg-gray-900`, `text-slate-500`). Always semantic tokens.
3. No new z-index values above `z-50`.
4. Buttons go through `--nz-btn-radius`, not hardcoded `rounded-*`.
5. Status colors via `text-status-*`, never `text-emerald-*` / `text-red-*`.

---

## Pointers

- [`docs/design-tokens.md`](docs/design-tokens.md) — canonical token reference with every brand mode override and carve-out.
- [`docs/detail-design-patterns.md`](docs/detail-design-patterns.md) — micro-interaction patterns (motion, focus, hover).
- [`components/ui/COMPONENTS.md`](components/ui/COMPONENTS.md) — primitive catalog. Use a primitive instead of styling raw HTML.
- [`app/globals.css`](app/globals.css) — the actual definitions. If a token is missing here, this doc is wrong; fix the doc, not by inventing a new token.
