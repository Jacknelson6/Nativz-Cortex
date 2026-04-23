---
name: qa-loop
description: "Autonomous build-test-fix loop. Uses Playwright MCP to navigate the running app, screenshot every page, find UI/UX bugs, log issues, then fix them. Run after building a feature or as a standalone QA pass. Triggers on: /qa, /qa-loop, 'test everything', 'check the app', 'QA this', 'run QA'."
---

# QA Loop — Autonomous Build-Test-Fix

## Overview

This skill runs an autonomous QA cycle against the running dev server. It uses the Playwright MCP browser tools to:

1. **Navigate** every page in the app
2. **Screenshot** each page state
3. **Inspect** for visual bugs, broken UI, accessibility issues
4. **Log** all findings to a structured issue list
5. **Fix** each issue in priority order
6. **Re-test** the fixes

## Prerequisites

- Dev server must be running (`npm run dev` on port 3001)
- Playwright MCP tools must be available (browser_navigate, browser_snapshot, browser_take_screenshot, etc.)

## Phase 1: Test & Record

### Step 1 — Start browser session

```
1. Use browser_navigate to go to http://localhost:3001/admin/login
2. Take a screenshot to confirm the app is running
3. If login is needed, authenticate with team test credentials (never commit passwords; use env or 1Password)
```

### Step 2 — Systematic page crawl

Navigate to each page in this order and take screenshots. For each page:

1. **Navigate** to the page URL
2. **Wait** for content to load (browser_wait_for network idle or key selector)
3. **Take screenshot** to visually inspect
4. **Take snapshot** (accessibility tree) to check for missing labels, broken hierarchy
5. **Check console** (browser_console_messages) for errors/warnings
6. **Log findings** — any visual issues, console errors, or accessibility problems

#### Page routes to test (in order):

**Core pages:**
- `/admin/dashboard`
- `/admin/tasks`
- `/admin/pipeline`
- `/admin/scheduler`
- `/admin/search/new` (research wizard)
- `/admin/analysis` (moodboard/analysis hub)
- `/admin/presentations`
- `/admin/clients`
- `/admin/team`
- `/admin/knowledge`
- `/admin/nerd` (AI chat)

**Settings & profile:**
- `/admin/settings`
- `/admin/analytics/monthly`
- `/admin/analytics/platforms`

**Detail pages (if data exists):**
- Click into the first client from `/admin/clients`
- Click into the first pipeline item
- Open the research wizard and check step 1 + step 2

### Step 3 — Interaction tests

For key interactive flows, test the actual interactions:

1. **Research wizard**: Open → type a topic → select client → click Next → verify step 2 loads
2. **Pipeline**: Switch between Board/List/Table views
3. **Scheduler**: Click month navigation arrows
4. **Analysis**: Paste a URL in the quick analyze input
5. **Team**: Click on a team member card to open the modal
6. **Knowledge graph**: Wait for graph to render, zoom in/out

### Step 4 — Theme tests

If the app has an AC (Anderson Collaborative) brand mode toggle:

1. Switch to AC mode
2. Re-visit 5 key pages (dashboard, pipeline, scheduler, team, research wizard)
3. Screenshot each in AC mode
4. Check for: invisible text, wrong colors, missing contrast, hardcoded dark-mode colors

## Phase 2: Issue Log

After crawling, create a structured issue log at `qa-results.md` in the project root:

```markdown
# QA Results — [date]

## Summary
- Pages tested: X
- Issues found: X (Y critical, Z warning)
- Console errors: X

## Critical Issues
| # | Page | Issue | Type |
|---|------|-------|------|
| 1 | /admin/team | Initials circle invisible in AC mode | UI |

## Warnings
| # | Page | Issue | Type |
|---|------|-------|------|

## Console Errors
| # | Page | Error | Severity |
|---|------|-------|----------|

## Passed
- [list of pages with no issues]
```

## Phase 3: Fix Loop

For each issue in the log (critical first, then warnings):

1. **Read** the relevant component file
2. **Fix** the issue
3. **Re-navigate** to the page and screenshot to verify
4. **Mark** the issue as fixed in the log

After all fixes:
- Run `npx tsc --noEmit` to verify no type errors
- Re-screenshot any pages that had fixes
- Update the issue log with final status

## Phase 4: Report

Output a final summary:
- Total issues found
- Total issues fixed
- Any remaining issues that need manual attention
- Screenshots of before/after for key fixes

## What to look for

### UI Bugs (Critical)
- Invisible text (white on white, etc.)
- Broken layouts (overflow, misaligned elements)
- Missing content (empty states showing when data exists)
- Buttons/links that don't work
- Forms that can't be submitted

### UI Bugs (Warning)
- Wrong colors in themed mode (AC brand)
- Hardcoded colors that don't adapt to theme
- Inconsistent spacing or sizing
- Missing loading states
- Missing error states

### UX Issues
- Confusing navigation (dead ends, unclear labels)
- Missing feedback (no toast on actions)
- Slow perceived performance (no loading skeleton)
- Inaccessible elements (no labels, missing focus states)

### Console Issues
- Runtime errors (unhandled exceptions)
- 404 API calls
- Hydration mismatches
- Deprecation warnings

## Integration with other skills

- After QA, use `cortex-review` to check any API routes that were modified
- After QA, use `frontend-patterns` to verify component patterns
- Before QA, ensure `npm run dev` is running (check with `curl -s http://localhost:3001`)

## Running the skill

Invoke with: `/qa` or `/qa-loop`

You can also pass a scope:
- `/qa team` — only test the team page
- `/qa ac-theme` — only test AC brand mode
- `/qa pipeline scheduler` — test specific pages
