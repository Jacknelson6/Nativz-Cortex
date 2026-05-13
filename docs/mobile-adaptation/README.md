# Cortex mobile adaptation — playbook

The hard rule that frames every PRD in this folder:

> **Desktop UI does not change.** Every mobile adaptation is strictly additive.

This doc captures the global rules, technical strategy, and design vocabulary the PRDs build on. Read this first.

---

## Hard constraint: zero desktop regressions

We keep the entire current desktop experience byte-for-byte. Mobile work is layered on top.

**Tailwind technique.** All existing classes stay where they are. Mobile overrides use the `max-*` range variants so they only fire below the desktop breakpoint:

```html
<!-- before -->
<div class="grid grid-cols-3 gap-4 p-6">

<!-- after — desktop classes untouched, mobile overrides added with max-lg: -->
<div class="grid grid-cols-3 gap-4 p-6 max-lg:grid-cols-1 max-lg:gap-3 max-lg:p-3">
```

Where the mobile layout is radically different (e.g. sidebar disappears, replaced by a bottom tab bar), use a parallel block gated by `hidden lg:flex` / `flex lg:hidden`. The desktop block keeps every existing class; the mobile block is new code.

**Forbidden:** changing or removing any existing utility class, breakpoint, or layout primitive on a component that already ships to desktop. If you find yourself wanting to refactor a desktop component to "make it responsive," stop — wrap it in a mobile-only sibling instead.

---

## Breakpoints

Cortex is Tailwind v4. We use:

| Range | Token | Used for |
|------|------|---------|
| `< 640px` | `max-sm:` | Phone portrait (iPhone SE up to large phones) |
| `640-1023px` | `sm:` and `max-lg:` | Phone landscape, small tablets |
| `≥ 1024px` | `lg:` | **Desktop — unchanged baseline** |

**Mobile-first rule.** The desktop breakpoint is `lg`. Anything below `lg` is "mobile" for this work. Tablet (`sm:` to `max-lg:`) gets the same layout as phone unless a PRD calls it out.

**Why not redesign for tablet too?** Out of scope. Tablet inherits the mobile layout. If a tablet-specific layout is justified later it gets its own PRD.

---

## The 7 transformations

Every page maps to a small number of recurring shape changes. PRDs reference these by name.

### 1. **Sidebar → bottom tab bar + drawer**

The left rail (`components/layout/admin-sidebar.tsx`) is hidden below `lg`. In its place:

- **Bottom tab bar** (5 items max): Dashboard, Calendar, Finder, Lab, More
- **"More" opens a drawer** with the full sidebar tree (sections + accordions)
- **Brand pill** moves to the top header on mobile; tapping it opens the same brand switcher popover but full-screen as a sheet

Why a tab bar at all? Brand work happens with thumbs in transit. Calendar, Finder, and Lab are the three highest-traffic brand surfaces — they earn permanent thumb-zone real estate.

### 2. **Top bar collapse**

`AdminTopBar` shrinks to a 56px-tall header on mobile containing only:
- Hamburger (opens drawer, mirrors the bottom More tab for accessibility)
- Brand pill (compact: logo + truncated name, no chevron text)
- Avatar (opens account popover as a bottom sheet)

Search and command palette are reached via a search icon in the header. ⌘K hint hidden.

### 3. **Multi-column grid → single column stack**

Any `grid grid-cols-N` where N ≥ 2 collapses to `max-lg:grid-cols-1` (or `max-md:grid-cols-1 max-lg:grid-cols-2` if a 2-up is justified). Card grids stack; sidebar+main layouts stack with sidebar moving to a sheet.

### 4. **Data table → card list**

Any `<table>` with more than 2 visible columns hides on mobile and renders a card list. Cards expose: primary identifier (top, bold), 2-3 secondary fields (smaller, muted), and primary action (tap-target right side or bottom). Inline row actions become a kebab menu opening a sheet.

`max-lg:hidden` on the `<table>`, `hidden max-lg:block` on the card list.

### 5. **Modal/dialog → bottom sheet**

Modals (Radix dialogs, custom centered overlays) on mobile render as full-width bottom sheets with a drag handle, 90vh max height, snap-to-50% support where useful. Forms inside get sticky bottom CTAs above the keyboard.

### 6. **Tabs → segmented control or horizontal scroll**

- ≤ 3 tabs: segmented control, full-width.
- 4-6 tabs: horizontal-scroll pill row with momentum scroll, active pill scrolls into view.
- 7+ tabs: convert to a Select dropdown that shows the active tab; tap to open a sheet listing all tabs.

`/admin/clients/[slug]/settings` (10 tabs) is the canonical 7+ case.

### 7. **Hover → tap / long-press**

Tooltips become long-press popovers. Hover actions (edit pencils that appear on row hover) become persistent on mobile, scaled down to fit the row. Drag-and-drop becomes long-press → up/down chevrons.

---

## Touch & sizing rules

- Minimum tap target: **44 × 44 px**, with 8px of padding between adjacent targets.
- Minimum body text: **15 px** (some screens currently use 13 px; bump only on mobile via `max-lg:text-[15px]`).
- Form inputs: **16 px** minimum font size to prevent iOS auto-zoom.
- Bottom CTAs sit above the iOS home indicator (`pb-[env(safe-area-inset-bottom)]`).
- Sticky headers on long scrolling pages: bottom border, blur backdrop, no shadow.

---

## Navigation patterns

**Back/up.** Brand-scoped detail pages (e.g., `/finder/[id]`, `/notes/[id]`) get a chevron-left in the header on mobile only. Desktop relies on the breadcrumb / sidebar; mobile gets explicit back affordance.

**Scroll restoration.** Lists that lead to detail views must restore scroll position on back. Already on by default with App Router; verify per PRD if list virtualization is involved.

**Empty states.** Most empty states say "Pick a brand from the top bar." On mobile this becomes "Pick a brand from the top of the screen" with a chevron pointing up at the header pill. Same copy rules otherwise.

---

## What is explicitly out of scope

- Tablet-bespoke layouts (inherits mobile).
- iOS/Android native apps. This is web-mobile only.
- Adapting analytics chart rendering (recharts) — charts render at full width with horizontal scroll if needed, no re-implementation.
- Reducing feature count on mobile. **No mobile-hidden features.** If a feature would be unusable on phone (e.g., kandy ad template editor) the PRD says so and falls back to a "best viewed on desktop" interstitial — not a feature gate.
- Re-skinning the desktop nav.
- The presentations / present-mode surfaces (`/admin/presentations/[id]/present`, `/present/[token]`) — already designed for big screens, mobile is best-effort.

---

## Verification checklist (per PRD)

Each PRD's "done" state needs:

1. Visual QA at 375 × 812 (iPhone SE class), 414 × 896 (large phone), and 768 × 1024 (small tablet).
2. Touch targets verified ≥ 44 × 44 with DevTools inspector.
3. Desktop screenshot diff: zero pixels changed at `lg+` against the pre-change baseline.
4. Keyboard-on iOS test for any form on the page.
5. Sticky elements behave correctly on scroll (no overlap with iOS bottom safe area).

---

## Files in this folder

- `README.md` — this playbook
- `INDEX.md` — one-line summary of every PRD with a link
- `prds/brand/` — brand-pill-scoped surfaces (`(app)` shell)
- `prds/admin/` — admin-only surfaces
- `prds/portal-public/` — viewer portal + public token surfaces
- `prds/auth/` — login / signup / reset / invite-accept

Each PRD has the same shape: purpose, desktop-unchanged surface map, mobile transformations applied (referenced from the 7 above), out-of-scope notes.
