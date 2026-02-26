# Nativz Cortex — UI Revision Pass
## Product Requirements Document

---

## Overview

Comprehensive UI revision across 7 admin dashboard pages addressing bugs, UX inconsistencies, styling drift, and feature gaps identified during stakeholder review. Goal: production-quality polish, consistent design system adherence, and removal of dead/broken features.

## Objectives

1. Fix all identified bugs (ingestion failures, metadata issues, persistence bugs, tab highlighting)
2. Standardize UI patterns (buttons, badges, spacing, modals) to match design system
3. Remove dead features (Profile Extract, Viral Library, Rescript for Brand)
4. Add missing functionality (multi-contact, multi-client select, health score override, AC PDF export)
5. Simplify workflows (shoot ideation, moodboard transcription)

## Success Criteria

- All pages render without visual bugs or console errors
- Design system consistency across all revised pages
- No broken navigation or dead routes
- All data persists correctly after creation/edit
- PDF exports render correctly for both Nativz and AC branding

---

## TASK-1: New Search — Client Selection Modal Layout

Fix modal positioning, alignment, width, padding, and overflow when selecting a client in the search header.

**Acceptance criteria:**
- Modal aligns correctly relative to header container
- Modal has proper width, padding, no content overflow
- Modal is accessible and visually clear
- Works on all viewport sizes

---

## TASK-2: New Search — Client List Enhancements

Add client logo and agency indicator (Anderson Collaborative / Nativz) to each item in the client selection list.

**Acceptance criteria:**
- Client logo displays next to client name
- Agency badge (AC or Nativz) visible per client
- Layout scales for long client lists without overflow
- Visually structured and readable

---

## TASK-3: New Search — Relocate Search History

Move search history section below the "What would you like to research today?" prompt, Brand Intel block, and Topic Research block.

**Acceptance criteria:**
- Search history appears below research type blocks
- Layout hierarchy is correct
- Spacing consistent with rest of page

---

## TASK-4: New Search — Remove Attribution Text

Remove "Powered by Brave Search plus Claude AI" text from the search page.

**Acceptance criteria:**
- Attribution text no longer visible
- No layout break after removal

---

## TASK-5: Dashboard — Rename Heading

Change heading from "Command Center" to "Dashboard". Subheading unchanged.

**Acceptance criteria:**
- Heading reads "Dashboard"
- Styling consistent with other page headings

---

## TASK-6: Dashboard — Remove Shoots/Moodboard Metric Block

Remove the "Upcoming Shoots and Mood Board Items" metric card from the top row. Retain "Searches This Month" and "Total Clients".

**Acceptance criteria:**
- "Upcoming Shoots and Mood Board Items" card removed
- Grid reflows cleanly with remaining cards
- Spacing remains consistent

---

## TASK-7: Dashboard — Review Action Button Section

Evaluate placement and styling of action buttons (New Search, Schedule Shoot, New Mood Board, On-board Client) for consistency with design system.

**Acceptance criteria:**
- Button styling matches design system patterns
- Visual hierarchy doesn't conflict with metrics above
- Layout responsive on all viewports

---

## TASK-8: Dashboard — Validate Recent Activity

Confirm recent activity section populates correctly with chronologically accurate data and no overflow issues.

**Acceptance criteria:**
- Data populates correctly
- Chronological order verified
- No UI overflow

---

## TASK-9: Dashboard — Rename and Fix Shoots This Week

Rename "Next seven days" to "Shoots this week". Fix missing scheduled shoot display.

**Acceptance criteria:**
- Section label reads "Shoots this week"
- Upcoming shoots display correctly
- Date filtering logic validated

---

## TASK-10: Dashboard — Recent Searches View All

Confirm full dataset displays. Add "View All" button matching "Shoots this week" section pattern.

**Acceptance criteria:**
- Search count accurate
- "View All" button present with correct placement
- Button navigates to search history page

---

## TASK-11: Shoots — Ideate Button Styling

Match Ideate button styling to Schedule Shoot button.

**Acceptance criteria:**
- Ideate button matches Schedule Shoot styling
- Consistent hover and active states

---

## TASK-12: Shoots — Remove Star Icon in Ideate Modal

Remove star icon next to Ideate Shoot button inside modal.

**Acceptance criteria:**
- Star icon removed
- No layout shift
- Modal alignment intact

---

## TASK-13: Shoots — Calendar Drag-to-Reschedule with Confirmation

Already-scheduled shoots should be draggable to a new date but require a confirmation dialog before rescheduling. Prevent duplicate scheduling.

**Acceptance criteria:**
- Scheduled shoots are draggable on calendar
- Dragging triggers confirmation dialog
- Confirmed drag updates the shoot date
- Cancelled drag reverts position
- No duplicate scheduling possible

---

## TASK-14: Shoots — Ideation Redesign (Single Text Box + AI)

Replace structured ideation blocks (Roz, Editing assignment, Client approval, Boosting) with a single editable text box and an "Ideate shoot plan" button that generates content into the box.

**Acceptance criteria:**
- Structured blocks removed
- Single text box present in notes section
- "Ideate shoot plan" button generates AI plan into text box
- Text box is editable after generation
- Content persists on save

---

## TASK-15: Shoots — Validate Links Section

Confirm links section remains functional with no regressions.

**Acceptance criteria:**
- All links render correctly
- Routing works
- No regressions from other changes

---

## TASK-16: Shoots — Multi-Client Select All

Add "Select All" option to client selection when scheduling shoots. Enable bulk selection.

**Acceptance criteria:**
- "Select all" option available
- Bulk selection mode works
- Scheduling applies to all selected clients
- State persists during multi-select
- UX is clear during bulk scheduling

---

## TASK-17: Mood Board — Fix TikTok Link Ingestion

Fix failure when pasting TikTok URLs into mood board. Ensure item creation, thumbnail, title, and metadata populate.

**Acceptance criteria:**
- TikTok URL creates board item successfully
- Thumbnail populates
- Title and metadata populate
- No ingestion errors in console

---

## TASK-18: Mood Board — Fix Instagram Metadata

Fix Instagram items showing "Untitled video" with no thumbnail. Ensure metadata fetches and persists.

**Acceptance criteria:**
- Instagram link fetches title metadata
- Thumbnail populates
- No "Untitled video" default when metadata exists
- Metadata persists after refresh

---

## TASK-19: Mood Board — Standardize Button Styling

Audit all action buttons inside mood board items. Remove emojis, standardize colors, match design system.

**Acceptance criteria:**
- No emoji-based button styling
- Consistent color system across all buttons
- Matches Cortex design system
- Consistent hover/active/disabled states
- Clean visual hierarchy

---

## TASK-20: Mood Board — Click-to-Open Side Panel

Enable clicking entire mood board block to open the details/analysis side panel (not just the Details button).

**Acceptance criteria:**
- Clicking block opens side panel
- Details button still works
- Click doesn't conflict with drag behavior
- Consistent with board-style UX patterns

---

## TASK-21: Mood Board — Decouple Hook and Pacing Logic

Fix hook button triggering pacing logic. Decouple the two. Evaluate removing pacing button.

**Acceptance criteria:**
- Hook button performs only hook-related action
- Pacing logic separated or removed
- UI reflects accurate button functionality

---

## TASK-22: Mood Board — Fix Instagram Transcript Extraction

Debug transcript extraction for Instagram. Fix transcribe button not functioning.

**Acceptance criteria:**
- Transcript extraction works for Instagram
- Transcript persists after generation
- Transcript survives page refresh

---

## TASK-23: Mood Board — Auto-Transcription on Ingestion

Implement automatic transcription attempt when media is ingested. Consolidate into single transcription control.

**Acceptance criteria:**
- Transcription auto-attempts on media ingestion
- Single transcription control (no redundant triggers)
- Transcript status visible to user
- Downstream analysis depends on transcript state

---

## TASK-24: Mood Board — Remove Rescript for Brand

Remove "Rescript for Brand" button entirely.

**Acceptance criteria:**
- Button removed
- No layout breaks

---

## TASK-25: Mood Board — Rename Replication Brief

Rename "Replication Brief" to "Replicate this video".

**Acceptance criteria:**
- Button label reads "Replicate this video"
- Function unchanged
- Routing works

---

## TASK-26: Mood Board — Fix Notes Persistence

Fix notes reverting to "Click to edit" after exiting. Ensure save fires on blur/exit.

**Acceptance criteria:**
- Note content persists after edit
- Save fires on blur/exit
- Database write confirmed
- No UI reset on state change

---

## TASK-27: Mood Board — Fix Node Connections

Fix unreliable connections, inability to delete connections, and unpredictable behavior.

**Acceptance criteria:**
- Connections visually reflect actual state
- Can delete connections
- Drag-to-connect works consistently
- Connections persist after refresh
- No orphaned/invalid edges

---

## TASK-28: Mood Board — Fix Website Item Metadata

Fix website links showing "Untitled video". Detect content type, populate title from OpenGraph.

**Acceptance criteria:**
- Content type detected (website vs video)
- Title populated from OpenGraph metadata
- No "Untitled video" for website items
- Metadata persists after refresh

---

## TASK-29: Mood Board — Fix Extract Insights for Websites

Fix loader not resolving, insights requiring page reload. Auto-update block after generation.

**Acceptance criteria:**
- Insights extraction completes successfully
- Loader resolves properly
- Block auto-updates (no manual refresh needed)
- OpenGraph extraction automatic on ingestion

---

## TASK-30: Mood Board — Cross-Platform Ingestion Audit

Audit ingestion and metadata for TikTok, Instagram, YouTube, and arbitrary websites. Ensure consistent flow.

**Acceptance criteria:**
- Consistent ingestion flow across all platforms
- Transcript availability logic correct per platform
- Consistent UI behavior regardless of source

---

## TASK-31: Navigation — Fix Active Tab Highlighting

Fix Profile Extract and Viral Library highlighting Mood Board tab. After removal, ensure all remaining tabs highlight correctly.

**Acceptance criteria:**
- Each page has independent active state
- Correct tab highlights on page load
- No shared layout container causing mis-highlighting

---

## TASK-32: Navigation — Remove Profile Extract and Viral Library

Remove Profile Extract and Viral Library pages, routes, and sidebar navigation entries completely.

**Acceptance criteria:**
- Pages deleted
- Routes removed
- Sidebar entries removed
- No broken links
- No other workflows broken by removal

---

## TASK-33: Onboarding — Validate End-to-End Flow

Validate full onboarding wizard flow. No structural changes.

**Acceptance criteria:**
- Flow completes end-to-end
- No validation failures
- Data persists after completion
- Routing post-completion works

---

## TASK-34: Clients — Health Score Dropdown Override

Replace unreliable health score with manual dropdown override (Poor/Fair/Good/Excellent).

**Acceptance criteria:**
- Dropdown with Poor/Fair/Good/Excellent options
- Manual selection persists
- Visual indicator updates correctly

---

## TASK-35: Clients — Green AC Badge

Make Anderson Collaborative agency badge green.

**Acceptance criteria:**
- AC badge is green
- Only badge changes color (not card)
- Consistent badge styling across all clients

---

## TASK-36: Clients — Content Strategy Section Cleanup

Remove "Top Video Ideas" section. Keep high-level content strategy. Add expand/collapse for full strategy view.

**Acceptance criteria:**
- "Top Video Ideas" removed or suppressed
- High-level strategy remains
- Full strategy viewable via expand/collapse
- Persistence validated

---

## TASK-37: Clients — Fix PDF Export

Fix Nativz logo scaling (aspect ratio). Implement AC branded export option based on client agency.

**Acceptance criteria:**
- Nativz logo maintains proper aspect ratio
- AC branded PDF export available
- Branding auto-selects based on client agency
- Layout consistent in both versions

---

## TASK-38: Clients — Saved Ideas Layout

Fix layout width and responsive scaling for saved ideas section.

**Acceptance criteria:**
- Proper layout width
- Responsive scaling works
- Content truncation logic correct

---

## TASK-39: Clients — Recent Searches Display Fix

Remove "not sent" label. Retain "sent" label only when applicable. Fix visual alignment.

**Acceptance criteria:**
- "not sent" label removed
- "sent" label shows only when applicable
- Brand/topic badge aligns with timestamp
- Consistent spacing and date formatting

---

## TASK-40: Clients — In-Context Mood Board and Shoot Buttons

Add "Create Mood Board for this client" button within mood board block. Add "Schedule Shoot" within shoot blocks. Auto-populate client context.

**Acceptance criteria:**
- "Create Mood Board for this client" button in mood board section
- "Schedule Shoot" button in shoot section
- Client ID auto-populated in routing
- No duplicate scheduling
- UI consistent

---

## TASK-41: Clients — Multi-Contact Support

Implement multi-contact support with name, email, role, and primary flag.

**Acceptance criteria:**
- Can add multiple contacts per client
- Each contact has name, email, role fields
- One contact marked as primary
- Can edit and delete contacts
- Persistence validated
- UI scales for multiple entries

---

## TASK-42: Clients — Agency Selector Chevron Spacing

Add spacing between chevron and container edge.

**Acceptance criteria:**
- Chevron has proper spacing from container edge
- Matches design system alignment
- Responsive behavior maintained

---

## TASK-43: Clients — Center Client Logo

Center logo within container, reduce excess whitespace.

**Acceptance criteria:**
- Logo centered vertically and horizontally
- Excess whitespace reduced
- Consistent rendering across logo aspect ratios

---

## TASK-44: Clients — Validate Portal Access and Brand Preferences

Validate portal access functionality and brand preference persistence.

**Acceptance criteria:**
- Portal access routing works
- Brand preferences persist
- No regressions from other changes

---

## Development Phases

### Phase 1 — Quick Wins (TASK-4, 5, 6, 9, 10, 11, 12, 24, 25, 35, 39, 42, 43)
Copy changes, removals, simple renames, badge colors, spacing fixes.

### Phase 2 — Bug Fixes (TASK-17, 18, 22, 26, 27, 28, 29, 31, 37)
Fix broken ingestion, metadata, persistence, connections, tab highlighting, PDF scaling.

### Phase 3 — UX Improvements (TASK-1, 2, 3, 7, 13, 14, 16, 19, 20, 21, 23, 30, 36, 40)
Modal layout, client list enhancements, drag-to-reschedule, ideation redesign, button standardization, click-to-open, auto-transcription, cross-platform audit.

### Phase 4 — New Features (TASK-34, 38, 41, 44)
Health score dropdown, multi-contact support, saved ideas layout, portal validation.

### Phase 5 — Cleanup (TASK-32, 8, 15, 33)
Remove dead pages, validate activity/links/onboarding.

---

## Technical Stack

No stack changes. All work within existing:
- Next.js 15 (App Router) + TypeScript
- Supabase (Postgres + Auth)
- Tailwind CSS v4
- React Flow (moodboard canvas)
- lucide-react icons
- Sonner toasts
- @react-pdf/renderer

## Assumptions

- AC logo asset exists in project
- Removing Profile Extract and Viral Library won't break other workflows
- Existing design system patterns are followed for all new/revised components
- Moodboard transcription pipeline (tikwm, oEmbed, HTML scrape) is the foundation for ingestion fixes

## Dependencies

- AC logo file must be available for PDF export task
- Multi-contact requires database migration (new table or JSONB field)
- Health score override requires migration (new column)
