# Proposals + packages — design (Cortex-native, replaces ContractKit)

**Date:** 2026-04-24
**Status:** Scaffolded today (tables + stub admin page); editor ships next session
**Owner:** Jack
**Follow-on to:** `2026-04-23-revenue-hub-design.md`

## 1. Problem

ContractKit has no public API and no outbound webhooks, so bi-directional sync is impossible without running our own fork of AC's Cloudflare deployment. Jack wants the proposal/contract flow **inline in Cortex**: admins assemble a package from reusable blocks, send a link to the client, client reads + signs + pays the deposit via Stripe, and onboarding fires on sign. ContractKit becomes a **reference template** only — we don't integrate with it.

## 2. User flow

1. Admin opens `/admin/proposals` → clicks **New proposal** → picks or creates a client.
2. Editor (`/admin/proposals/[slug]`) has three panels:
   - **Content** — title, scope statement, body (markdown), terms (markdown). Pulls from `proposal_package_templates` so "SMM retainer" / "Content production" / "Launch package" are reusable.
   - **Packages** — add one or more `proposal_packages` rows, each with `name`, `tier`, `monthly_cents`, `annual_cents`, `setup_cents`, `deliverables[]`. Calculator on the right totals setup + first-month or first-year charge.
   - **Deposit + Stripe** — toggle "require deposit", set deposit amount (defaults to setup + first month), pick "create Stripe Payment Link" on send.
3. Admin clicks **Send** → we:
   - Flip `status='sent'`, set `sent_at=now()`.
   - Create a Stripe Payment Link for the deposit (`stripe.paymentLinks.create`) — stash `stripe_payment_link_id`, `stripe_payment_link_url`.
   - Render the proposal PDF at `signed_pdf_path` (later — can skip on first send, render at sign-time).
   - Email the signing link to `signer_email` via Resend (reuses `sendOnboardingEmail`).
4. Client opens `/proposals/[slug]` (public, no auth):
   - Reads the proposal. Every view appends a `proposal_events` row (`type='viewed'`, ip, ua) → sets `viewed_at` on first view only.
   - **Sign** panel: typed name + checkbox "I agree to the terms" → POST `/api/proposals/public/[slug]/sign` with signer details.
   - On sign → flip `status='signed'`, set `signed_at`, render + store signed PDF, fire `onProposalSigned` which:
     - Creates a `client_contracts` row (`external_provider='cortex'`, `external_id=proposal.id`, `signed_at`, `total_cents`, `deposit_cents`, `external_url=/proposals/<slug>`).
     - Advances `clients.lifecycle_state` from `lead` → `contracted`.
     - Logs `contract.signed` lifecycle event.
     - Notifies admins (`contract_signed`).
     - If a Stripe Payment Link was created, show it on the thank-you page so they can pay immediately.
5. When the deposit is paid → Stripe `invoice.paid` (or `checkout.session.completed` from the Payment Link) fires the **existing** lifecycle wiring: advance onboarding phase 1, notify admins, send kickoff email.

## 3. Data model (already live in migration 155)

- `proposals` — id, client_id, slug (public URL), title, status, signer_*, total_cents, deposit_cents, currency, body_markdown, scope_statement, terms_markdown, expires_at, sent_at, viewed_at, signed_at, paid_at, signature_method, signature_image, signed_pdf_path, stripe_payment_link_*, stripe_invoice_id, metadata, created_by, timestamps.
- `proposal_packages` — id, proposal_id, name, description, tier, monthly_cents, annual_cents, setup_cents, sort_order.
- `proposal_deliverables` — id, package_id, name, quantity, sort_order.
- `proposal_events` — audit log (`type` in sent|viewed|signed|expired|clicked_pay, ip, ua, metadata).
- `proposal_package_templates` — reusable package prototypes for the picker.

## 4. Surfaces to build

| Surface | Notes |
| --- | --- |
| `/admin/proposals` | List view (scaffolded today). Row actions: open, duplicate, archive. |
| `/admin/proposals/new` | Create — pick client + starting template. Redirect to editor. |
| `/admin/proposals/[slug]` | Editor — three-panel (content / packages / deposit). Autosave. |
| `/admin/proposals/templates` | CRUD for `proposal_package_templates`. |
| `/proposals/[slug]` | Public signing page. No auth. Rate-limited. |
| `POST /api/proposals/public/[slug]/view` | Fires a viewed event. |
| `POST /api/proposals/public/[slug]/sign` | Locks + signs. |
| `POST /api/admin/proposals/[id]/send` | Creates Payment Link, emails signer. |
| `POST /api/admin/proposals/[id]/revoke` | Sets status=canceled. |

## 5. PDF rendering

Reuse existing `@react-pdf/renderer` pattern (already wired for branded deliverables). Template lives in `components/proposals/pdf/ProposalPdf.tsx`. Render at sign time, upload to Supabase Storage bucket `proposals-signed`, store path in `signed_pdf_path`. Bucket is private; admin access only — we hand out signed URLs for downloads.

## 6. Stripe payment link

`stripe.paymentLinks.create({ line_items: [...], after_completion: { type: 'redirect', redirect: { url: `${APP_URL}/proposals/[slug]/paid` } }, metadata: { cortex_proposal_id } })`. Line items assembled from `proposal_packages[].setup_cents + monthly_cents` (first month) — or an explicit deposit line item if `deposit_cents` is set. `automatic_tax: { enabled: true }` when Stripe Tax is configured (§8).

On successful payment → Stripe `checkout.session.completed` webhook already handled; we extend `onCheckoutCompleted` to: look up proposal by `metadata.cortex_proposal_id`, flip `status='paid'`, link `stripe_invoice_id`, fire the existing invoice.paid lifecycle chain.

## 7. Client linkage

- Proposals can be created against an **existing client** (sets `client_id`) or a **prospect** (no client_id, fill signer_name/email only). On sign, if no client yet, we create a minimal `clients` row (name from proposal title or signer company, slug generated, `lifecycle_state='contracted'`, `organization_id` inherited from the creating admin).

## 8. Stripe Tax

- New agency setting: `stripe_tax_enabled boolean`. When true, every Stripe-side creation (payment links, invoices, subscriptions) sets `automatic_tax: { enabled: true }`. Stripe needs tax registrations configured on their side first.
- UI: one toggle on `/admin/settings/billing` (new page). Reads from `agency_settings` table (extended with the column).

## 9. Out of scope for this follow-on

- Redlining / counter-proposals. MVP is send-sign, no negotiation loop.
- Multi-party sign. Single signer per proposal.
- Expiration reminders. MVP honors `expires_at` by rejecting signs past that date; email reminders come later.
- Variable-tier calculator (launchpad/growth/dominance). Tier is metadata; the price is whatever you set in packages.

## 10. Implementation sequence (next session)

1. `/admin/proposals/new` + editor — Phase 1 of editor with autosave.
2. Public signing page + `/api/proposals/public/*` routes.
3. `POST /api/admin/proposals/[id]/send` — Payment Link + Resend.
4. `onCheckoutCompleted` extension in the Stripe webhook.
5. `ProposalPdf` React-PDF template.
6. `/admin/proposals/templates` CRUD.
7. Stripe Tax toggle on `/admin/settings/billing`.
