# Clients — Mobile PRD

**Routes:** `/admin/clients`, `/admin/clients/new`, `/admin/clients/onboard`, `/admin/clients/[slug]`, `/admin/clients/[slug]/contract`, `/admin/clients/[slug]/deliverables`, `/admin/clients/[slug]/workspace`, `/admin/clients/[slug]/settings` (+ 9 sub-tabs)
**Actor:** admin
**Sidebar:** Admin → Clients

## Purpose
Client roster. Per-client workspace with everything the agency needs to run an account: settings (10 tabs), contract, deliverables, workspace dashboard. Onboarding wizard for new clients.

## Desktop UI (UNCHANGED)
- **`/admin/clients`:** roster table (logo, name, tier, lifecycle state, last activity, agency, kebab).
- **`/admin/clients/new`:** quick-add form (name, slug, industry).
- **`/admin/clients/onboard`:** 4-step wizard (Input → Analyze → Strategy → Review).
- **`/admin/clients/[slug]`:** workspace overview with deep links.
- **Per-client settings (10 sub-tabs):** General, Brand, Info, Contacts, Access, Integrations, Notifications, Partnership, Danger, Settings root.

## Mobile transformations
**Apply from playbook: T1, T2, T3, T4, T5, T6**

### Roster (`/admin/clients`)
- Table → card list (T4). Card: logo (40 × 40), name + tier, lifecycle pill, last activity, kebab.
- Search input + filter chips (tier, lifecycle, agency) at top — horizontal-scroll pills (T6).
- "New client" + "Onboard" CTAs collapse into a single split-button FAB; tap shows both options as a sheet.

### Onboarding wizard (`/onboard`)
- 4-step wizard: convert progress dots to a numbered stepper at the top (1/4, 2/4 ...).
- Each step is a vertical form sheet filling the viewport. Sticky bottom Continue/Back buttons.
- The Analyze step's "live status" panel stays inline; long-running spinner needs to remain visible while user scrolls (sticky).

### Client workspace (`[slug]`)
- Multi-section dashboard. Each section becomes a stacked card. Use playbook collapse + sticky-section-header pattern.
- "Edit" affordances persistent (T7).

### Settings 10 sub-tabs
- **Trigger playbook 7+-tab rule:** convert horizontal tab bar to a **Select dropdown** that shows the current sub-tab name; tap to open a sheet listing all 10 with icons + descriptions.
- Each sub-tab page renders single-column with `SectionPanel` cards stacked, edit pencils persistent (mirrors `/brand-profile` pattern).
- **General:** name, slug, agency, lifecycle, services chips.
- **Brand:** identity (overlap with brand-profile; share the same edit sheets).
- **Info:** lifecycle, services, monthly capacity.
- **Contacts:** list of contact cards; add/edit via sheet.
- **Access:** `user_client_access` list; add via sheet with a user search.
- **Integrations:** integration cards (Zernio, Mux, etc.) with connect/disconnect.
- **Notifications:** webhook + digest config; form sheet per row.
- **Partnership:** UpPromote / affiliate setup.
- **Danger:** destructive actions (delete client, archive). Two-tap confirmations on mobile.
- **Settings root (index):** overview of all 10 sub-tabs.

### Contract page
- Long-form contract content. Use `prose` width-capped, full mobile width, no edits on mobile (read-only). "Edit on desktop" hint at top.

### Deliverables page (per-client view)
- Mirror brand-root `/deliverables` mobile pattern.

## Touch & sizing
- Roster card: 72px tall.
- Settings Select dropdown trigger: 48px tall.
- Danger-zone destructive buttons: 48px tall, two-step confirm.

## Out of scope
- Bulk client operations.
- The contract editor (read-only on mobile).
- Inline column reordering on roster.

## Acceptance criteria
- Switching between settings sub-tabs takes 1 tap from anywhere on the page.
- Roster scrolls without jank past 100 clients.
- Add-contact, add-access, connect-integration flows complete in <30s.
- Desktop diff = 0 at `lg+`.
