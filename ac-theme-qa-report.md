# AC Theme QA Sweep Report
**Date:** 2026-03-19
**Tester:** Claude (automated via Playwright browser)
**Mode tested:** Anderson Collaborative (AC) brand mode on admin pages

## Summary

Overall, the AC theme implementation is solid. The sidebar, cards, buttons, page backgrounds, and primary accent colors all correctly switch to the light/teal palette. However, there are **28 instances of hardcoded Tailwind `purple-*` classes** across 21 source files that do not respect the AC theme. These produce visible purple borders and backgrounds in AC mode where teal should appear.

---

## Issues Found

### ISSUE 1: Hardcoded purple border/bg on "What can I do?" button (Nerd page)
- **Page:** `/admin/nerd`
- **Element:** "What can I do?" sparkle button
- **File:** `app/admin/nerd/page.tsx` (line ~420)
- **Problem:** Uses `border-purple-500/20 bg-purple-500/[0.04] hover:bg-purple-500/[0.08]` instead of themed `accent2` variables
- **What it looks like:** Purple-tinted border and background on a teal-themed page
- **What it should look like:** Teal border/bg matching the `accent2-text` color already used for the text
- **Fix:** Replace `border-purple-500/20` with `border-accent2/20`, `bg-purple-500/[0.04]` with `bg-accent2-surface`, `hover:bg-purple-500/[0.08]` with `hover:bg-accent2/[0.08]`

### ISSUE 2: Hardcoded purple border on "Generate strategy" card (Research hub)
- **Page:** `/admin/search/new`
- **Element:** "Generate strategy" card border
- **File:** `components/research/research-hub.tsx` (line ~144)
- **Problem:** Uses `border border-purple-500/25` instead of `border-accent2/25`
- **What it looks like:** Faint purple border around the generate strategy card
- **What it should look like:** Teal border matching AC palette
- **Fix:** Replace `border-purple-500/25` with `border-accent2/25`

### ISSUE 3: Hardcoded purple hover states on Ideas path selector
- **Page:** `/admin/ideas` (ideas hub)
- **Element:** Path selector cards hover state
- **File:** `components/ideas-hub/path-selector.tsx` (line ~45)
- **Problem:** Uses `hover:border-purple-500/70 hover:bg-purple-500/[0.04]`
- **Fix:** Replace with `hover:border-accent2/70 hover:bg-accent2-surface`

### ISSUE 4: Hardcoded purple focus ring on combo-select component
- **Page:** Any page using the combo-select (pipeline, etc.)
- **Element:** Dropdown focus state
- **File:** `components/ui/combo-select.tsx` (line ~97)
- **Problem:** Uses `focus:border-purple-500 focus:ring-purple-500` instead of `focus:border-accent2 focus:ring-accent2`
- **Fix:** Replace purple-500 references with accent2

### ISSUE 5: Hardcoded purple in Ideas results page (7 instances)
- **Page:** `/admin/ideas/[id]`
- **Element:** Multiple card borders, skeleton loaders, section dividers
- **File:** `app/admin/ideas/[id]/results-client.tsx` (7 occurrences)
- **Problem:** Uses `border-purple-500/20`, `bg-purple-500/5`, `border-purple-500/10`, `border-purple-400` throughout
- **Fix:** Replace all `purple-500` and `purple-400` with `accent2` equivalents

### ISSUE 6: Hardcoded purple in Ideas result card
- **Page:** `/admin/ideas/[id]`
- **File:** `app/admin/ideas/[id]/idea-result-card.tsx` (2 occurrences)
- **Problem:** Uses `border-purple-500/20` and `bg-purple-500/[0.03]`

### ISSUE 7: Hardcoded purple in search results
- **Page:** `/admin/search/[id]`
- **File:** `app/admin/search/[id]/results-client.tsx` (line ~187)
- **Problem:** Uses `border-purple-500/20 bg-purple-500/5`

### ISSUE 8: Hardcoded purple in search processing badge
- **File:** `components/search/search-processing.tsx` (line ~33)
- **Problem:** Deep search badge uses `bg-purple-500/10 text-purple-400 border-purple-500/20`

### ISSUE 9: Hardcoded purple in pipeline types
- **File:** `components/pipeline/pipeline-types.ts` (line ~78)
- **Problem:** "Sent to paid media" status uses `bg-purple-500/20 text-purple-400 border-purple-500/30`

### ISSUE 10: Hardcoded purple in various minor elements
- `components/results/topic-row-expanded.tsx` - viral_potential badge
- `components/results/niche-insights.tsx` - bullet dot
- `components/dashboard/pipeline-widget.tsx` - bullet dot
- `components/moodboard/video-analysis-panel.tsx` - visual complexity bar
- `components/settings/usage-dashboard.tsx` - Apify icon color
- `components/knowledge/KnowledgeNodeCard.tsx` - document type border
- `app/admin/knowledge/knowledge-explorer.tsx` - document node
- `lib/utils/sentiment.ts` - viral_potential sentiment color
- `components/research/ideas-wizard.tsx` - 1 occurrence
- `components/research/search-ideas-wizard.tsx` - 1 occurrence
- `app/admin/shoots/page.tsx` - 1 occurrence
- `app/admin/presentations/[id]/social-audit-editor.tsx` - 1 occurrence

---

## Pages Verified Clean (no issues)

These pages rendered correctly in AC mode with proper light backgrounds, teal accents, and readable text:

1. `/admin/dashboard` - Clean. Light bg, teal accents, proper sidebar.
2. `/admin/pipeline` - Clean. Table renders well, status badges look fine.
3. `/admin/scheduler` - Clean. Calendar, media library, buttons all correct.
4. `/admin/analysis` - Clean. Cards, icons, URL input all readable.
5. `/admin/presentations` - Clean. Card with tier list renders properly.
6. `/admin/clients` - Clean. Client cards, agency badges (Nativz/AC), search all correct.
7. `/admin/team` - Clean. Team cards, avatar circles, status dots all appropriate.
8. `/admin/knowledge` - Clean. Graph visualization renders with teal nodes.
9. `/admin/settings` - Clean. All form inputs, toggle switches, tabs render correctly.
10. `/admin/nerd` - Mostly clean except Issue 1 (purple "What can I do?" button).

---

## Recommended Fix Strategy

All 28 occurrences follow the same pattern: replace hardcoded Tailwind `purple-*` classes with the themed `accent2` CSS variable equivalents:

| Hardcoded class | Themed replacement |
|---|---|
| `text-purple-400` | `text-accent2-text` |
| `text-purple-500` | `text-accent2` |
| `text-purple-700` | `text-accent2` |
| `bg-purple-400` | `bg-accent2` |
| `bg-purple-500/N` | `bg-accent2/N` or `bg-accent2-surface` |
| `bg-purple-100` | `bg-accent2-surface` |
| `border-purple-400` | `border-accent2` |
| `border-purple-500/N` | `border-accent2/N` |
| `ring-purple-500` | `ring-accent2` |
| `focus:border-purple-500` | `focus:border-accent2` |
| `hover:border-purple-500/N` | `hover:border-accent2/N` |
| `hover:bg-purple-500/N` | `hover:bg-accent2/N` |

The CSS variables (`--accent2`, `--accent2-surface`, etc.) are already correctly defined in `app/globals.css` for both Nativz (purple) and AC (teal) modes. The only issue is that some components bypass the CSS variable system by using raw Tailwind purple classes.

---

## No Critical Issues

- No white-text-on-white-background issues found
- No dark backgrounds that should be light
- No invisible icons or empty states
- Sidebar colors, card backgrounds, and primary button colors all correct
- Charts/graphs on knowledge page use appropriate colors
- Input fields are all readable with proper borders
