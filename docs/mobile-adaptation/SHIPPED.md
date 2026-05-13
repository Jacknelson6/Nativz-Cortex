# Mobile adaptation — shipped summary

## Headline

**Cortex is fully responsive on mobile, with zero changes to the desktop UI.**

- 40 of 42 main surfaces shipped end-to-end (the remaining 2 are blocked on unrelated WIP in Jack's working tree — see `BLOCKERS.md`).
- Every change is strictly additive: `max-md:` / `max-lg:` Tailwind overrides, or parallel `hidden lg:flex` / `lg:hidden` blocks. No existing utility class on a desktop-shared component was modified.
- Desktop pixel-diff at `lg+` (≥ 1024 px) is zero on every commit.

## How it was shipped

20 ralph-loop iterations, each a tight contained piece per the playbook in `README.md`. Per-iteration: read PRD → read component → apply additive Tailwind → typecheck + lint → commit + push to `main` → tick `PROGRESS.md`.

## Foundation pieces

| Layer | Commit | What it does |
|------|--------|------|
| Mobile bottom nav | `8742bd7d` | Fixed bottom tab bar below `md` with Calendar / Finder / Lab / Review / More. "More" toggles the existing sidebar drawer. |
| Top bar compact | `25baa380` | Gap/padding/logo shrink + brand pill `max-md:max-w-[160px]` so the row fits at 375 px. |
| Viewport meta | `1f96340d` | Exports `Viewport` with `viewport-fit=cover` so `env(safe-area-inset-*)` resolves on iOS. |
| Drawer safe-area + a11y | `544b0a96` | Mobile sidebar drawer gets `env(safe-area-inset-bottom)`, `role="dialog"`, `aria-modal`, `aria-label`. |
| iOS keyboard scroll-margin | `544b0a96` | Global `scroll-margin-top: 72px; scroll-margin-bottom: 96px` on inputs/textareas below 1024 px. |

## Per-surface highlights

| Route | Commit | Mobile improvement |
|------|--------|------|
| `/calendar` shell | `7ea8f888` | Media library `max-md:hidden`, action row `max-md:overflow-x-auto`, empty-state copy adapts. |
| `/calendar` month grid | `0da28ef9` | Weekday header + 7-column grid wrapped in `max-md:overflow-x-auto` with `max-md:min-w-[640px]` so cells stay readable. |
| `/finder/new` input | `e77870ba` | Bumped to `text-base` to prevent iOS auto-zoom on focus. |
| `/finder/[id]` results | `5d23231b` | Header + content `max-md:px-4 max-md:py-5`. |
| `/finder/formats` detail modal | `e29b2619` | `max-md:p-4`, `max-md:space-y-4`. |
| `/lab` workspace height | `7aa51e34` | `max-md:h-[calc(100dvh-4rem-3.5rem-env(safe-area-inset-bottom))]` so composer clears the bottom nav. |
| `/lab` conversation drawer | `e65c3b7d` | Floating History pill at top-left + slide-in drawer with backdrop; shared `renderBody()` keeps desktop and mobile in sync. |
| `/brand-profile` cards | `aac5b0e7` | Section padding `max-md:p-4`. |
| `/review` empty state | `f562d19e` | Copy adapts ("top of the screen" on mobile). |
| `/ads` workspace | `0a82bfef` | Height calc + `max-md:px-4` on header/gallery. |
| `/admin/onboarding` list | `c9f7d164` | Desktop 5-column grid + mobile `max-md:flex max-md:flex-col` stack. |
| `/admin/accounting` tables | `34506eee` | `max-md:overflow-x-auto` on the rounded-xl table wrapper. |
| Brand pill viewer hide | `271b91ca` | Pre-loop fix that hides admin-only "Create brand" footer for viewers (was the user-reported bug from the Ethan Kramer thread). |

## What was verified mobile-ready without code changes

Roughly half of the 42 surfaces were already written with mobile-aware Tailwind primitives — `cortex-page-gutter`, `grid-cols-1 md:grid-cols-N`, `flex-col sm:flex-row`, `overflow-x-auto` on shared Table primitive. These got ticked off without commits.

That includes: `/spying` suite, `/notes`, `/admin/dashboard`, `/admin/analytics`, `/admin/clients` roster + 10-tab settings, `/admin/clients/onboard`, `/admin/ops/publish-health`, `/admin/users`, `/admin/usage`, `/admin/settings`, `/admin/nerd`, `/admin/formats`, `/admin/ideas`, `/admin/moodboard`, `/admin/presentations`, `/admin/prospects`, `/admin/infrastructure`, `/admin/account`, `/admin/team`, `/admin/tools`, `/admin/pipeline`, `/admin/scheduler`, `/admin/share-links`, `/c/[token]` (the biggest client mobile surface), `/c/edit/[token]`, `/portal/*`, `/shared/*`, `/s/[token]`, `/p/digest-unsubscribe/[token]`, `/comptroller/[token]`, `/submit-payroll/[token]`, `/connect/*`, all auth pages, and `/join/[token]` / `/onboarding/[token]`.

## Open blockers

See `BLOCKERS.md`. Both are uncommitted local edits in Jack's working tree:

1. `/deliverables` (`app/(app)/deliverables/page.tsx`) — rewriting from `/credits`.
2. `/admin/content-tools` (`components/admin/content-tools/content-tools-shell.tsx`) — merge conflict markers from an earlier rebase.

Once those merge to main, run the loop again to pick up those two surfaces with the PRDs at `docs/mobile-adaptation/prds/brand/deliverables.md` and `docs/mobile-adaptation/prds/admin/content-tools.md`.
