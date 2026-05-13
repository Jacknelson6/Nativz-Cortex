# Onboarding (admin) — Mobile PRD

**Routes:** `/admin/onboarding`, `/admin/onboarding/[id]`
**Actor:** admin
**Sidebar:** Admin → Onboarding

## Purpose
Unified onboarding tracker for new clients (both SMM and editing). Replaces legacy `/admin/sales` pipeline. Tracks proposal → signed → kickoff → live.

## Desktop UI (UNCHANGED)
- **`/admin/onboarding`:** Kanban-style board with columns for each onboarding stage. Cards drag between columns.
- **`/admin/onboarding/[id]`:** per-onboarding detail; checklist of pending tasks, proposal status, signing state, intake form responses.

## Mobile transformations
**Apply from playbook: T1, T2, T3, T5, T6, T7**

### List page
- Kanban → tabbed list (T6). Tab per stage. Active tab's cards stack 1-up.
- Card: client logo, name, stage, last touch, blocked indicator (if blocked), kebab.
- "Add onboarding" FAB.

### Detail page
- Single-column. Sections: status header, intake form responses (collapsed accordion), proposal panel, signing state, kickoff checklist, recent activity.
- Stage-advance action: dropdown in the sticky header — tap → sheet with stage list and confirm-to-move.
- Long-press a card on the list view → "Move to stage" sheet (T7, replaces desktop drag-drop).

## Touch & sizing
- Stage tab pills: 36px tall.
- Stage-advance confirm sheet: stage list 56px-tall rows.

## Out of scope
- Multi-onboarding bulk advance.
- Live-collab presence (still tied to underlying realtime, no UI change).

## Acceptance criteria
- Stage move firable from list or detail in <3 taps.
- Intake form responses readable without horizontal scroll.
- Desktop diff = 0 at `lg+`.
