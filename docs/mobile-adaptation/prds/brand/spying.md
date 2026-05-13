# Competitor Spying — Mobile PRD

**Routes:** `/spying`, `/spying/audits`, `/spying/audits/[id]`, `/spying/self-audit`, `/spying/self-audit/[id]`, `/spying/versus`, `/spying/watch`
**Actor:** admin + viewer (brand-scoped)
**Sidebar:** Brand tools → Spying

## Purpose
Cross-channel competitor & self analysis suite. Audits a competitor's social presence; self-audits the active brand; head-to-head versus mode; watch list for ongoing monitoring.

## Desktop UI (UNCHANGED)
- **`/spying` landing:** entry hub with cards linking to each sub-tool + recent audits feed.
- **`/spying/audits`:** list of past competitor audits; columns for competitor handle, score, last run, agency-confirmed socials.
- **`/spying/audits/[id]`:** the redesigned interactive audit report — KPI strip, content sections, social profile cards, embed previews, recommendations.
- **`/spying/self-audit` + `[id]`:** identical shape, scoped to the active brand.
- **`/spying/versus`:** side-by-side comparison view (2 columns of audit data).
- **`/spying/watch`:** watch list with periodic re-audit cadence.

## Mobile transformations
**Apply from playbook: T1, T2, T3, T4, T5, T6, T7**

### `/spying` landing
- Entry-cards grid → stack 1-up. Each card 56-72px tall with icon + name + 1-line gloss.
- Recent audits feed → card list.

### Audit list pages (`/audits`, `/self-audit`)
- Table → cards (T4). Card: competitor handle (top), score pill, last-run timestamp, kebab.
- New audit FAB bottom-right.

### Audit report (`[id]` pages)
- KPI strip becomes a 2-column grid on mobile (`max-lg:grid-cols-2`). Each KPI tile: stat + label, no extra chrome.
- Content sections (engagement, posting cadence, top posts, etc.) stack vertically. Section header sticky on scroll.
- Embed previews (post screenshots): 16:9 thumbnails in a horizontal-scroll snap row per section.
- Social profile cards: stack 1-up. Each card has tap-to-expand for the per-platform metrics.
- Recommendations list: stack as cards. Long copy collapses to 3 lines with "read more."
- **Interactive social disambiguation modal** (memory: was a recent push) → renders as a full bottom sheet on mobile with one platform per page, swipe horizontally between platforms.

### `/spying/versus`
- 2-column side-by-side is the whole point of the page. On mobile, **render as alternating-row pairs:** Brand A row, Brand B row, repeat per metric. Each row pair groups under the metric label.
- Floating "swap" button to flip which brand is A vs B.
- If the user really wants side-by-side, "best viewed on desktop" hint at top.

### `/spying/watch`
- Card list. Each card: competitor handle, next-audit-at, last delta. Tap → audit detail.

## Touch & sizing
- KPI tiles 44 × 44 minimum; readable at 375px (use `tabular-nums`).
- Embed thumbnails: 120 × 67.5, 8px gap, full row scroll.

## Out of scope
- Multi-pane simultaneous comparison across 3+ competitors.
- The benchmark cron analytics branch (memory item) — handled server-side, no UI change.

## Acceptance criteria
- Audit report readable end-to-end with one thumb scroll.
- Versus mode comprehensible without horizontal scroll.
- Watch list "run again" action firable from card kebab.
- Desktop diff = 0 at `lg+`.
