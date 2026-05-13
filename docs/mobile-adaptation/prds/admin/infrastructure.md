# Infrastructure — Mobile PRD

**Route:** `/admin/infrastructure`
**Actor:** super-admin
**Sidebar:** Not in sidebar.

## Purpose
Platform infrastructure dashboard. Database state, cron status, integration health rolled into one ops surface.

## Desktop UI (UNCHANGED)
- Multi-card dashboard with status rows for each subsystem.

## Mobile transformations
**Apply from playbook: T1, T2, T3**

### Layout
- Cards stack 1-up. Each card shows subsystem name + status pill + last check + tap for detail.
- Critical-status cards (red) sort to top.

## Out of scope
- Subsystem-specific deep ops actions on phone.

## Acceptance criteria
- Critical issues visible in first viewport.
- Desktop diff = 0 at `lg+`.
