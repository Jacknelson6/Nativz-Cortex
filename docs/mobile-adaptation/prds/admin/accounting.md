# Accounting — Mobile PRD

**Routes:** `/admin/accounting`, `/admin/accounting/[id]`, `/admin/accounting/editor/[memberId]`
**Actor:** super-admin only
**Sidebar:** Admin → Accounting (super-admin gated)

## Purpose
Internal accounting. Invoices, editor payroll, client revenue tracking.

## Desktop UI (UNCHANGED)
- **`/admin/accounting`:** table of invoices / period summaries / status.
- **`/admin/accounting/[id]`:** single invoice detail with line items.
- **`/admin/accounting/editor/[memberId]`:** per-editor payroll page.

## Mobile transformations
**Apply from playbook: T1, T2, T3, T4, T5**

### List
- Table → card list. Card: client, period, amount, status pill, kebab.

### Invoice detail
- Line items stack as cards or a simple two-column list (label / amount).
- Total summary sticky at bottom.
- Action buttons (Mark paid, Send, Download PDF) as a sticky bottom row.

### Editor payroll
- Editor avatar + name at top, totals strip, per-deliverable list with rate + total.
- PDF export action in header kebab.

## Out of scope
- Editing invoices on mobile beyond status changes (full edits desktop-only).
- The export-to-CSV power flow.

## Acceptance criteria
- Marking paid takes 2 taps with confirm.
- Totals always visible.
- Desktop diff = 0 at `lg+`.
