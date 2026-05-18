# Foundation Audit

Read-only inventory of the Cortex codebase as of 2026-05-18. No code changed. This file feeds Phases 2-5 of the rebuild.

Counts are real measurements (grep / ls / wc), not estimates.

## 1. Component inventory

### Primitives (`components/ui/`, 38 files)

The directory is already the single source of truth. No Button/Input/Modal duplicates were found. Variants that look duplicative (3 button files, 2 tooltip files) are intentional design choices, called out below.

| File | One-line purpose | Sample usage | Notes |
|---|---|---|---|
| `avatar-editor.tsx` | Canvas-based image crop + zoom for user avatars | `app/admin/account/`, `app/portal/profile/` | Feature-adjacent but listed here |
| `badge.tsx` | Inline status pill (accent / accent2 / status colors) | Scattered across tables, headers | |
| `button.tsx` | Canonical button. Variants: primary, secondary, outline, ghost, danger, success. Sizes xs-lg. Shape-aware (pill on Nativz, rectangle on Anderson via `--nz-btn-radius`) | Everywhere | **Canonical.** Use this. |
| `card.tsx` | Container with `bg-surface`, no resting shadow (Nativz is flat) | Dashboard tiles, settings cards | |
| `checkbox.tsx` | Radix Checkbox wrapper | Forms, table row selection | |
| `client-picker.tsx` | Account / org selector dropdown | Admin header | Feature-specific; lives here for reuse |
| `client-portfolio-selector.tsx` | Multi-select for client assets | Admin client config | Feature-specific |
| `combo-select.tsx` | Search + select (Radix-based) | Forms with long option lists | |
| `confirm-dialog.tsx` | Yes/no shell built on `dialog.tsx` | Delete buttons, destructive actions | Use this instead of rolling a one-off confirm modal |
| `context-menu.tsx` | Right-click menu (Radix) | Table rows | |
| `date-time-picker.tsx` | Range + single value picker | Scheduler, analytics filters | |
| `dialog.tsx` | Radix Dialog wrapper | Base shell for all modals | **Canonical modal primitive.** Feature modals should compose this, not Radix directly. |
| `dropdown-menu.tsx` | Radix DropdownMenu, auto-themes via `--color-popover` | Row action menus | |
| `encrypted-text.tsx` | Char-scramble reveal animation | Marketing flourishes | One-off-ish, but reused in landing + reveals |
| `floating-dock.tsx` | Sticky bottom action bar | Detail pages with multi-action footers | |
| `glass-button.tsx` | Frosted-glass button (alt CTA style) | Marketing surfaces | **Intentional variant**, not a duplicate of `button.tsx`. Different visual register. |
| `glow-button.tsx` | Animated glow-ringed button | Hero CTAs, Anderson-mode overrides | **Intentional variant.** |
| `icon-card.tsx` | Icon + text block | Feature grids | |
| `image-upload.tsx` | Drop zone + preview | Asset uploaders | |
| `input.tsx` | Text input with label + error slot | Forms | **Canonical.** |
| `loading-skeletons.tsx` | Reusable skeleton patterns (list, table, card) | List-loading states | |
| `page-shell-skeleton.tsx` | Full sidebar + main content skeleton | Top-level route loading | |
| `popover.tsx` | Radix Popover | Inline help, floating panels | |
| `schedule-range-picker.tsx` | Calendar range selection | Scheduler | Feature-specific, here for reuse |
| `scroll-progress.tsx` | Reading position indicator | Long-form pages | |
| `scroll-to-top.tsx` | Fixed FAB | Long lists | |
| `select.tsx` | Radix-based dropdown | Forms | **Canonical.** |
| `skeleton.tsx` | Single shimmer block (`bg-surface-elevated`) | Inline loading | **Canonical.** Use instead of inline `animate-pulse` divs. |
| `spotlight-card.tsx` | Hover spotlight card effect | Marketing surfaces | |
| `stepper.tsx` | Multi-step progress indicator | Onboarding, wizards | |
| `sub-nav.tsx` | Secondary nav tabs | Section pages | |
| `table.tsx` | Semantic row / cell components | Lists | **Canonical primitive**, but not a `DataTable`, just shells. See inconsistency #3 below. |
| `tag-input.tsx` | Pill-shaped tag entry | Filter chips, tag editors | |
| `text-flip.tsx` | Vertical scroll text animation | Marketing | |
| `time-picker-15.tsx` | 15-minute interval time picker | Scheduler | |
| `toggle.tsx` | Radix-based radio-like button | Filters | |
| `tooltip.tsx` | Radix Tooltip (small, inline) | Icon buttons | **Canonical** for short tooltips. |
| `tooltip-card.tsx` | Larger card-style tooltip with structured content | Data viz, table cells | **Intentional variant** of `tooltip.tsx`, different content density. |

### Composed (reusable shells, ~10 files)

| File | Purpose |
|---|---|
| `components/layout/sidebar.tsx` | Admin + portal sidebar shell |
| `components/layout/header.tsx` | App header chrome |
| `components/layout/footer.tsx` | Footer chrome |
| `components/admin/section-tabs.tsx` | Admin secondary tabs |
| `components/shared/breadcrumbs.tsx` | Breadcrumb trail |
| `components/shared/empty-state.tsx` | Reusable empty state (used ~6 places, under-adopted) |
| `components/shared/page-error.tsx` | Reusable error state (~13 places) |
| `components/shared/stat-card.tsx` | Single-metric tile |
| `components/portal/brand-switcher.tsx` | Multi-brand client switcher |
| `components/portal/account-menu.tsx` | Portal user menu |

### One-off feature components (~400-500 files, by area)

Rough counts only. Each feature folder owns its own modals, cards, tables, and forms.

| Area | Approx. count | Notes |
|---|---|---|
| `components/clients/` | ~25 | Profile, settings, contract, team |
| `components/admin/content-tools/` | ~12 | Projects table + detail |
| `components/admin/prospects/` | ~18 | Bio, scorecard, monitoring |
| `components/portal/` (excl. shared) | ~20 | Brand switcher, account, profile |
| `app/(app)/results/` | ~15 | Search results, sentiment, trending |
| `app/(app)/scheduler/` | ~14 | Review table, platform dialog |
| `app/(app)/audit/` | ~12 | Landscape cards, PDF, share |
| `components/admin/formats/` | ~8 | Format cards, detail modal |
| `components/admin/{users,team,nerd,infrastructure}/` | ~60 combined | |
| Remaining ~45 feature folders | ~200+ | Moodboard, reporting, calendar, share, etc. |

### Duplicate / merge candidates

None of the primitives are accidental duplicates. The variant pairs/triads are deliberate:

- `tooltip.tsx` vs `tooltip-card.tsx`, different content density.
- `button.tsx` vs `glass-button.tsx` vs `glow-button.tsx`, different visual registers (utility, marketing, hero CTA).
- `dialog.tsx` (Radix shell) vs `confirm-dialog.tsx` (yes/no composition), composed primitive, not a duplicate.

The feature layer has potential merges (see inconsistency #2 and #3 below) but **no action is recommended in this rebuild**; flagged for a future pass.

---

## 2. Inconsistency report

### 2.1 Arbitrary Tailwind values: 1,558 total

`grep -rn 'className="[^"]*\b\(p\|m\|text\|bg\|w\|h\)-\['` across `app/` and `components/`. Of those, ~1,720 references contain a hex value (`[#...]`).

Categorized rough breakdown:

- **Brand-mode carveouts** (Anderson colors like `bg-[#36D1C2]`, `text-[#1F9489]`): high count, intentional, but should ideally route through `--accent` once the brand-mode override is fully respected by all surfaces.
- **Platform tints** (`bg-[#4285F4]` for Google, `bg-[#363636]` for Instagram mockup, `text-[#FF4D67]` for TikTok): tokenized via `--platform-*` CSS variables but only partially adopted in the React layer.
- **User-supplied hex** (moodboard tags, brand DNA color pickers, audit PDFs): legitimate, colors come from user data, must remain raw.
- **Pixel-perfect one-offs** (`top-[13px]`, `w-[42px]`): these are the real drift. Estimated low hundreds but not separately counted in this pass.

**Recommendation:** flag in CLAUDE.md as a Hard rule; surface to rules-reviewer agent in Phase 5; do not retrofit existing code in this rebuild.

### 2.2 Modal pattern fragmentation

`dialog.tsx` is the Radix shell, and `confirm-dialog.tsx` is the only composed yes/no variant. But the ~30 feature modals (`components/clients/contract/edit-contract-modal.tsx`, `components/moodboard/create-board-modal.tsx`, `components/share/gateway-modal.tsx`, etc.) each compose `dialog.tsx` directly with their own padding, header treatment, and footer button layout.

A small `FeatureModal` shell with `title`, `description`, `actions` slots would absorb ~30 ad-hoc compositions. **Flagged. Not built.**

### 2.3 Table fragmentation

`table.tsx` provides semantic `<TableRow>` / `<TableCell>` shells, not a `DataTable`. Feature tables roll their own:

- `components/clients/profile/profile-users-table.tsx`
- `components/reporting/platform-breakdown-table.tsx`
- `components/results/trending-topics-table.tsx`
- (and ~5 more)

Each has its own sort, pagination, empty-state, and loading shimmer logic. A `DataTable` primitive with column config, row actions, sort, pagination, and built-in skeleton would reduce drift. **Flagged. Not built.**

### 2.4 State component under-adoption

- `<EmptyState />` exists in `components/shared/empty-state.tsx`. Used in ~6 places. Many pages render their own "No data" div.
- `<PageError />` exists. Used in ~13 `error.tsx` boundaries and a handful of pages. Many pages use `toast.error` without a page-level error state.
- `<Skeleton />` and `<LoadingSkeletons />` exist. ~269 references across the codebase. Adoption is strongest here, weakest for empty / error.

Total files using any of the three reusable state components: **54** (out of ~500+ component files).

### 2.5 Loading-state coverage on admin pages

Sampled five admin/portal pages. Loading state coverage is the weakest dimension:

| Page | Loading | Empty | Error | Permission | Mobile |
|---|---|---|---|---|---|
| `app/admin/clients/page.tsx` | yes | yes | yes (PageError) | yes (isSuperAdmin button gate) | yes |
| `app/admin/users/page.tsx` | yes (boolean) | **missing** | yes (toast) | **missing at page level** | yes |
| `app/admin/dashboard/page.tsx` | **missing** | n/a | yes (PageError) | n/a | yes |
| `app/portal/analytics/page.tsx` | **missing** | yes (custom div) | **missing** | yes (`getPortalClient`) | yes |
| `app/portal/research/formats/page.tsx` | **missing** | yes | **missing** | yes (`getPortalClient`) | yes |

### 2.6 API route org scoping

- Total `route.ts` files under `app/api/`: **618**
- Files referencing `organization_id`: **145** (~23%)

Many admin routes don't need org scoping (single-tenant admin context). But some user-mutation routes are missing it:

- `app/api/analysis/edges/[id]` (PUT/DELETE), validates auth, no org check. A user with a valid session can mutate any edge by UUID.

**Flagged. Not fixed in this rebuild.** Real fix is a separate dedicated security pass.

---

## 3. Design token reality check

Pulled from `app/globals.css` (1,132 lines). This is what the codebase actually uses, not aspirational.

### 3.1 Token model: three layers

```
brand (raw)         semantic (used in CSS)       Tailwind utility (@theme inline)
─────────────       ──────────────────────       ──────────────────────────────
--nz-cyan           --accent                     bg-accent, text-accent
--nz-coral          --status-danger              text-status-danger
--nz-ink            --background                 bg-background
```

Components consume the Tailwind utility layer, which maps to semantic, which maps to brand. `[data-brand-mode="anderson"]` rewrites the semantic layer; the utility layer auto-updates because it's `var(...)` indirection.

### 3.2 Color tokens (semantic layer, Nativz default)

```css
--background: #0f1117;
--surface: #1a1d2e;
--surface-hover: #222640;
--surface-elevated: #242842;       /* skeleton tracks, inset states */

--text-primary: #f1f5f9;
--text-secondary: #cbd5e1;
--text-muted: #94a3b8;

--accent: var(--nz-cyan);          /* #00AEEF */
--accent-hover: var(--nz-cyan-700);
--accent-surface: rgba(0, 174, 239, 0.12);
--accent-text: #5BC7F2;            /* readable accent on dark */
--accent-contrast: #FFFFFF;        /* foreground on --accent fills */

--accent2: #EC4899;                /* fuchsia-500, secondary CTA */
--accent2-hover: #DB2777;
--accent2-surface: rgba(236, 72, 153, 0.12);
--accent2-text: #F472B6;

--status-success / -warning / -danger    (defined; values per globals.css)
```

### 3.3 Anderson collaborative mode override (light palette)

```css
[data-brand-mode="anderson"] {
  --background: #F9F8FA;           /* stone */
  --surface: #FFFFFF;              /* paper */
  --surface-hover: #F0F4F8;
  --text-primary: #001631;         /* navy-600 */
  --text-secondary: #111013;
  --text-muted: #617792;
  --accent: #36D1C2;               /* teal */
  --accent-hover: #2AB5A7;
  --accent-text: #1F9489;
  --accent-contrast: #FFFFFF;
  /* ...accent2 = orange, shadows softer, font swap: display = Rubik, body = Roboto */
}
```

### 3.4 Radii

```css
--nz-radius-sm: 5px;
--nz-radius-md: 10px;
--nz-radius-lg: 20px;
--nz-radius-pill: 9999px;
--nz-btn-radius: var(--nz-radius-pill);   /* pill in Nativz, pill in Anderson per QA */
```

### 3.5 Shadows / elevation (Nativz default)

```css
--shadow-card: none;                                        /* FLAT at rest */
--shadow-card-hover: 0 6px 18px rgba(0,0,0,.35), 0 2px 4px rgba(0,0,0,.25);
--shadow-elevated:   0 12px 32px rgba(0,0,0,.55), 0 4px 10px rgba(0,0,0,.3);
--shadow-dropdown:   0 6px 20px rgba(0,0,0,.55), 0 0 1px rgba(0,0,0,.3);
```

Anderson softens these: `0 8px 24px rgba(0,22,49,.08)` / `0 24px 60px rgba(0,22,49,.12)` / `0 12px 32px rgba(0,22,49,.14)`.

### 3.6 Motion

```css
--duration-fast: 150ms;
--duration-normal: 250ms;
--duration-slow: 400ms;
--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
--ease-spring:   cubic-bezier(0.34, 1.56, 0.64, 1);
```

### 3.7 Typography

```css
--font-sans:    var(--font-nz-body);     /* Poppins */
--font-display: var(--font-nz-display);  /* Jost (Nativz) / Rubik (Anderson) */
--font-ui:      var(--font-nz-sans);     /* Rubik */
```

Anderson reassigns: `--font-nz-display: Rubik`, `--font-nz-body: Roboto`.

### 3.8 Z-index (de facto, from primitives)

Used in `components/ui/`: `z-10`, `z-20`, `z-30`, `z-40`, `z-50`. No central z-index scale defined; the primitives are consistent in practice (popover/tooltip/dialog at 40-50, sticky header at 30, scroll-to-top at 50). Phase 3 `DESIGN_SYSTEM.md` will document the convention.

### 3.9 Platform tints

```css
--platform-tiktok: #ff4d67;
--platform-instagram: #e1306c;
--platform-youtube: #ef4444;
--platform-facebook: #60a5fa;
```

---

## 4. Current CLAUDE.md analysis

Current file: 170 lines, 16 top-level sections. Bucketed per the Phase-4 plan (user decision: keep load-bearing rules inline, delete the rest).

| Section | Verdict | Note |
|---|---|---|
| Project Overview | **CONSOLIDATE** → "What this app is" (3-5 lines) | Trim marketing-ish prose |
| Tech Stack | **KEEP** (rename to "Stack") | One-line bullets |
| Daily Commands | **DELETE** | Already in `docs/commands.md`; `verify` script will be the new truth signal |
| Reference Docs | **CONSOLIDATE** → new "Pointers" section | Trim list, keep load-bearing pointers |
| Session Startup | **DELETE** | Linear hook runs via `SessionStart` hook; narration belongs to harness output, not CLAUDE.md |
| Supabase MCP | **DELETE** | Setup steps live in `docs/supabase-mcp.md` |
| Marketing Skills | **DELETE** | Skill metadata loads automatically; CLAUDE.md should not narrate the skill system |
| Working Preferences (em-dash ban) | **KEEP** in Hard rules | Load-bearing |
| Working Preferences (plans always approved) | **KEEP** in Hard rules | Load-bearing |
| Working Preferences (run the commands) | **KEEP** as one line in Hard rules | "Run commands yourself, don't tell the user to", one bullet |
| Working Preferences (secrets in chat fine) | **DELETE** | Niche, low-frequency; relocate to a future `OPERATIONS.md` only if needed |
| Working Preferences (push-notify on remote control) | **DELETE** | Per user decision |
| Working Preferences (skim-first replies) | **DELETE** | Tone/style; verbose; relocate to future doc only if needed |
| Working Preferences (run until ship-ready) | **CONSOLIDATE** | Compress to one Hard rule: "Builds clean, types pass, visually consistent with siblings, before declaring done. Run `npm run verify`." |
| Working Preferences (completion message style) | **DELETE** | Per user decision |
| Key Conventions | **CONSOLIDATE** → Hard rules | Distill the non-trivial ones (sentence case, params Promise, null-safe AI responses, admin vs portal client choice) into individual Hard rule bullets |
| Task Delegation | **DELETE** | Per user decision (verbose taxonomy); the harness already documents subagent usage |
| Preferred Tools / Data Fetching / PDF | **DELETE** | Per user decision; rarely referenced |
| Large Data Files | **DELETE** | The constraint is already encoded in `scripts/generate-api-docs.ts` and a comment at the top of the generated file |
| Portal Security (CRITICAL) | **KEEP** in Hard rules | Load-bearing. Condense the code example to a one-line rule + pointer to `lib/portal/get-portal-client.ts` |
| Roles | **KEEP** in Hard rules or "What this app is" | Two lines |
| Short-form Video Focus | **KEEP** in "What this app is" | One line |
| Current Deploy | **CONSOLIDATE** into Stack | One line |
| Task Specs | **DELETE** | Implicit; trust the agent to read `tasks/` when relevant |
| Long-running sessions | **DELETE** | Harness behavior, not project context |

### Proposed final CLAUDE.md structure

```
1. What this app is              (3-5 lines)
2. Stack                         (one-line bullets, ~8 bullets)
3. Hard rules                    (10-12 bullets, each ≤ 2 lines)
4. Workflow                      (one paragraph)
5. File map                      (one line per dir, ~12 lines)
6. Pointers                      (one line per sub-doc, ~10 lines)
```

Target: 150-180 lines. Net change from current 170: roughly flat by line count, but most content gets replaced. Deleted content is recoverable from git history (commit `<TBD>`).

---

## 5. Edge case gaps (five existing features)

For each: a state coverage matrix. "missing" = the state isn't handled at all (page silently breaks, or there's no UI for it). "n/a" = the state genuinely doesn't apply (no list = no empty state).

### 5.1 Admin Clients List, `app/admin/clients/page.tsx`

| State | Status |
|---|---|
| Loading | yes |
| Empty (zero clients) | yes |
| Error (API fail) | yes (`PageError`) |
| Permission-denied | yes (`isSuperAdmin` gate on create button; route gated upstream) |
| Mobile | yes (`cortex-page-gutter`, `max-w-6xl`) |
| Single vs many | yes (grid handles both) |

Strongest example. Use as template.

### 5.2 Admin Users List, `app/admin/users/page.tsx`

| State | Status |
|---|---|
| Loading | yes (state boolean + conditional render) |
| Empty | **missing**, no message when zero users |
| Error | partial (toast only, no page state) |
| Permission-denied | **missing at page level** (API enforces, but page renders empty shell) |
| Mobile | yes |
| Single vs many | n/a (list only) |

### 5.3 Admin Dashboard, `app/admin/dashboard/page.tsx`

| State | Status |
|---|---|
| Loading | **missing** (static tiles render before data) |
| Empty | n/a |
| Error | yes (`PageError`) |
| Permission-denied | upstream-gated |
| Mobile | yes (`sm:`, `lg:` grid breakpoints) |
| Single vs many | n/a |

### 5.4 Portal Analytics, `app/portal/analytics/page.tsx`

| State | Status |
|---|---|
| Loading | **missing** |
| Empty (zero platforms) | yes (custom inline div, not `<EmptyState />`) |
| Error | **missing** (async errors crash to default error boundary) |
| Permission-denied | yes (`getPortalClient()` → redirect) |
| Mobile | yes (`lg:grid-cols-2`) |
| Single vs many | yes (card mapping) |

### 5.5 Portal Formats List, `app/portal/research/formats/page.tsx`

| State | Status |
|---|---|
| Loading | **missing** (SSR; no skeleton during hydration of any client islands) |
| Empty | yes (no-pinned-formats message) |
| Error | **missing** |
| Permission-denied | yes (`getPortalClient()` → redirect) |
| Mobile | yes |
| Single vs many | yes |

### Aggregate gap summary

Most common missing states across the sample:
1. **Loading** (3 of 5 missing)
2. **Error** at page level (3 of 5 missing, toast-only or unhandled)
3. **Empty using `<EmptyState />` primitive** (most pages roll their own when present at all)

This shapes the CLAUDE.md Hard rule "Edge cases up front: loading, empty, error, permission-denied, mobile, 0/1/many" and the rules-reviewer agent's checks on any new page.

---

## Out of scope (flagged, not built)

1. Fix the ~473 routes without org scoping. Most are admin-only and don't need it. Audit the ~50-100 user-facing mutation routes separately.
2. Extract `FeatureModal` shell from the ~30 feature dialog implementations.
3. Build `DataTable` primitive to absorb the 8 custom feature tables.
4. Migrate inline "No data" divs to `<EmptyState />`.
5. Add loading skeletons to admin dashboard, portal analytics, portal formats list.
6. Retrofit `text-[#hex]` arbitrary values to brand-mode tokens where feasible.

Each of these is its own task with its own plan. None of them are part of this rebuild.

---

## Phase 1 complete

Files created: this one.
Files modified: none.
Lines of code touched: zero.

Awaiting review before Phase 2 (component library consolidation: write `components/ui/COMPONENTS.md`).
