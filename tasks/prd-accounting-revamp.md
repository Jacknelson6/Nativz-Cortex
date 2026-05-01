# Accounting page revamp PRD

Source: Jack feedback (May 2026) on `/admin/accounting/[periodId]` after the Phase 1-3 ralph loop landed. The Margin tab + per-editor view + year matrix shipped, but the day-to-day data entry on a period is still slow + glitchy. This PRD captures every item to fix and orders them as phases for a ralph loop.

## Goals

- Make filling out a 24x/year payroll period feel like editing a spreadsheet, not a CRUD form.
- Editor numbers should mostly arrive **from the editor** (token link with Wise URL) or **from a paste import** (Notion/Wise dump). Manual row-by-row entry is the fallback, not the happy path.
- Keep SMM auto-fill respecting each client's `services` list.
- Strip surfaces that exist only for Jack-the-margin-recipient out of the period flow; the cross-period editor view + the year matrix already handle that.

## Non-goals

- Rebuilding the period schema. Every change is on top of the current `payroll_entries` shape.
- New API surface where existing endpoints can serve. We already have `/api/accounting/entries/bulk` for bulk insert.

## Phases (ralph-loop order)

### Phase A — Strip Margin tab from period detail

**Why:** Jack said the Margin tab is "kind of irrelevant" because the margin recipient is him. The per-period audit doesn't need it. The cross-period view + year matrix metric toggle still surface margin where it matters.

**Changes:**
- `components/accounting/period-detail-client.tsx`: drop `'margin'` from `TabKey` / `SERVICE_TAB_LABELS` / `SERVICE_TAB_ORDER`, drop the `MarginPane` import + render branch, drop the editing-count badge for the margin tab.
- Keep `components/accounting/margin-pane.tsx` on disk; it's still useful elsewhere later but no longer mounted.

### Phase B — Header + column-total polish on entries grid

**Why:** Jack asked for centered headers ("editor should be centered on the editor") and a running total at the bottom of the Amount column.

**Changes (in `components/accounting/entries-grid.tsx`):**
- Center-align the `<th>` for Manager / Client / Videos / Rate / Amount / Description; left-align stays on row-action columns.
- Match data cells: `text-center` on the same columns so the column reads as one stack.
- Add a sticky-style total row at the bottom that sums `amount_cents` (and `video_count` when the active service is editing).
- Total row matches the existing footer style on the year matrix (border-t-2, bg-background/30, font-semibold).

### Phase C — Fix the autosave glitch ("rows showing up in editing then deleting")

**Why:** Jack: "I just added a bunch of items to SMM, and then it got added to editing, and then it got removed."

**Likely root cause to investigate:** `DraftRowUI` schedules `setTimeout(onCommit, 0)` after every onChange; if the active service changes between updates the entry_type can be stale on the in-flight POST. Also worth checking: `onLocalCreate` returning a row with the wrong entry_type that the server then "corrects" on next refresh.

**Changes:**
- Lock `entry_type` to the active service at draft creation; don't read it from any later state.
- Replace the `setTimeout(onCommit, 0)` chain with a single debounced commit (200ms) so a draft only POSTs once after the user stops typing in a single row.
- After commit, refresh server entry into local state by entry id; never replace by index.
- Sanity-check: when the user clicks a different service tab while a draft is in-flight, cancel the in-flight POST or block the tab switch with a loading indicator.

### Phase D — Bulk select + bulk apply

**Why:** Jack: "if we could like change all at once rather than changing them all one by one… super essential."

**Changes:**
- Add a checkbox column at the front of `EntriesGrid` for existing rows (not draft rows; drafts are already empty).
- Header checkbox = select all / clear.
- When at least one row is selected, render a sticky bulk-action bar above the grid: Manager picker, Amount input, Description input, "Apply" button, "Delete" button.
- Apply hits `PATCH /api/accounting/entries/[id]` per selected row in parallel. (No new endpoint.)
- Delete hits `DELETE /api/accounting/entries/[id]` per selected row.
- Read-only mode hides the bulk bar entirely.

### Phase E — Preset amount library (SMM half-period $610)

**Why:** Jack: "social media management SMM, that is 12 20 per month per client, and so… $60 per client" (he said $60, meant $610 — confirmed by SMM workflow). Half-period auto-fill turns 24 fields into one click.

**Changes:**
- New `lib/accounting/presets.ts` module with `getPreset(service, halfPeriod) -> { amount_cents, description? }`.
  - SMM: $610.00 (61000 cents) per half period per client.
  - Editing/Affiliate/Blogging: no preset (yet).
- In `EntriesGrid` SMM mode, surface an "Apply $610 to selected" quick action in the bulk bar when service === 'smm'.
- In SMM mode, when a draft row picks a client, prefill the Amount input with the preset value (still editable). Same for the auto-added SMM client rows.
- Future-proof: leave a TODO marker so we can later move presets into a `payroll_presets` table editable from settings.

### Phase F — Editing tab into per-editor sub-tabs

**Why:** Jack: "we'll need like sub pages within editing so that we can sort the editors." Today's editors are Jed + Ken; Jack himself shows up because of his margin payout row.

**Changes:**
- When `activeTab === 'editing'`, render an inner `SubNav` of editors derived from `entries.filter(entry_type === 'editing')` grouped by `team_member_id ?? 'l:<label>'`.
- "All" is the default; each editor sub-tab filters the grid to that editor's rows + locks the manager picker on draft rows to that editor.
- Editor sub-tab counts + total payout in the badge.
- Order editors by total descending so Jed/Ken float to the top.

### Phase G — Submit-payroll token gets a Wise URL field

**Why:** Jack: "they put their wise link for payouts somewhere in there." Saves the manual round-trip of asking each editor for their Wise URL after they submit.

**Changes:**
- `payroll_entries` already accepts free-text `description`; for now we'll embed the Wise URL there (`Wise: <url>`). Later phase can promote it to a real column.
- Public submit page (`app/submit-payroll/[token]/page.tsx`): add a "Your Wise payment link" field above the rows. Persist via the existing `/commit` route which appends it to each saved row's description.
- Read it back on the period detail row description, render as a clickable link icon next to the description cell.

### Phase H — SMM client filter sanity + Notion/Wise import polish

**Why:** Jack: "we might have to work on making sure that the like the correct services are enabled." Plus he wants Notion/Wise dumps to fill rows.

**Changes:**
- Verify `autoAddSmmClients()` only inserts clients with `services?.includes('SMM')`. (Already does on line 121 of entries-grid; add a regression test or at least a log when the filter rejects a client.)
- Import preview already uses the LLM parser; add two paste examples in the Import dialog hint copy: a Notion table dump and a Wise CSV row format. No code change beyond the hint.
- If the LLM parse fails to map a field, the preview row should highlight which column was empty so the user can fix before commit.

## Verify gates per phase

After each phase:
1. `npx tsc --noEmit`
2. `npm run lint`
3. Browser smoke test where reasonable (Phase B/C/D/F especially).
4. Commit + push to main with a scoped message.

## Out of scope for this loop

- Adding a `payroll_presets` table.
- Promoting Wise URL to its own column.
- Email/Slack notifications when an editor submits via token.
- Adding a videographer/strategist payout pipeline.

## Open question (do not block on)

If a draft row commit fails after the user has tabbed away from that service, where should the row appear? Current behavior swallows it. Tentative: surface a banner on the parent period detail with a retry button.
