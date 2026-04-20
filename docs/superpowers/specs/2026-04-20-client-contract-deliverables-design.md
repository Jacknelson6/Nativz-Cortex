# Client contract deliverables — design

**Date:** 2026-04-20
**Status:** Approved, ready for implementation plan
**Owner:** Jack

## Problem

When the team opens a client workspace, there is no single place that shows what the client has actually paid for. Services are a free-text tag array (`clients.services`) maintained by hand, and deliverable quantities (e.g., "8 short-form videos/month") live nowhere — they exist only in contract PDFs scattered across Google Drive. New hires don't know what's in scope, and renewals silently drift from what was signed.

## Goal

Let the team upload a signed contract and, after a quick human review, have the system:

1. Store the contract file (with history across renewals and addenda).
2. Extract the list of monthly-recurring deliverables.
3. Extract the set of services covered (e.g., "Editing", "SMM", "Paid media").
4. Write those services back into `clients.services` as the single source of truth.
5. Surface all of this on a dedicated **Contract** tab in the client workspace.

**Non-goals for v1:** delivery-progress tracking (counters, behind-pace alerts), change-order semantics beyond "upload a new contract", one-time/scoped deliverables (monthly recurring only), portal-side visibility.

## User flow

1. Admin opens `/admin/clients/<slug>/contract`.
2. Clicks **Upload contract** → drag/drop PDF/DOCX/TXT.
3. Server stores file in `client-contracts` Supabase Storage bucket, extracts text, calls OpenRouter (`openai/gpt-5.4-mini`) with a Zod-constrained JSON schema.
4. Extraction returns a draft: `{ services, deliverables, effective_start?, effective_end?, suggested_label? }`.
5. Review modal renders the draft. Every row editable (service tag combobox, deliverable name, monthly quantity, notes). Admin can add/remove rows.
6. Admin clicks **Save**. Contract flips from `draft` to `active`. Deliverables insert. `clients.services` is recomputed as the union of `service_tag` across all active contracts for this client.
7. Contract page now shows: active service chips, deliverables grouped by service tag, active contracts list, collapsed past contracts list.

## Architecture

### Navigation
- New sidebar key `contract` added to `ADMIN_WORKSPACE_TOGGLE_KEYS` in `lib/clients/admin-workspace-modules.ts` (defaults to on, per existing pattern).
- Sidebar entry rendered in `components/clients/client-admin-shell.tsx` (or wherever the existing workspace nav lives).
- Portal viewers do not see the tab (admin-only workspace module, consistent with brand-dna/knowledge/ad-creatives).

### Routes
- `app/admin/clients/[slug]/contract/page.tsx` — server component, fetches contracts + deliverables, renders client component.
- `app/api/clients/[slug]/contracts/route.ts`
  - `GET` — list contracts + deliverables for the client (active + past).
  - `POST` (multipart) — upload + parse, returns draft + contract id in `draft` status.
- `app/api/clients/[slug]/contracts/[id]/confirm/route.ts`
  - `POST` — commit a draft with reviewed deliverables: `{ label, effective_start?, effective_end?, deliverables[] }`. Flips status to `active`, writes deliverables, triggers services recompute.
- `app/api/clients/[slug]/contracts/[id]/route.ts`
  - `PATCH` — edit label/status/effective dates/deliverables.
  - `DELETE` — remove contract + file + deliverables; recompute services.

Every route: `supabase.auth.getUser()` → admin role check (`role in ('admin','super_admin')`) → manual `clients.organization_id` scoping when using `createAdminClient()`. Zod validation on every body.

### Storage
- Supabase Storage bucket **`client-contracts`**, private, RLS-restricted.
- Object path: `{organization_id}/{client_id}/{contract_id}/{file_name}`.
- Upload order: server inserts a draft `client_contracts` row first (to mint `contract_id`), then uploads the file to the id-scoped path, then writes `file_path` back to the row. If the upload fails, the draft row is deleted in the same request.
- `file_path` column stores the storage path (not a public URL). File access through short-lived signed URLs only.

### Data model

**`client_contracts`**
| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `client_id` | uuid fk → `clients.id` | cascade delete |
| `label` | text | e.g. "Retainer 2026" — editable by user |
| `file_path` | text | storage path (not url) |
| `file_name` | text | original filename |
| `file_size` | int | bytes |
| `file_mime` | text | |
| `status` | text check in (`'draft','active','ended'`) | |
| `effective_start` | date nullable | |
| `effective_end` | date nullable | |
| `uploaded_by` | uuid fk → `auth.users.id` nullable | |
| `uploaded_at` | timestamptz default now() | |
| `notes` | text nullable | |
| `parse_meta` | jsonb nullable | `{ model, prompt_version, raw_response, confidence }` |

**`client_contract_deliverables`**
| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `contract_id` | uuid fk → `client_contracts.id` | cascade delete |
| `service_tag` | text not null | e.g. "Editing", "SMM", "Paid media" |
| `name` | text not null | e.g. "Short-form videos" |
| `quantity_per_month` | int not null check (>= 0) | |
| `notes` | text nullable | |
| `sort_order` | int default 0 | |
| `created_at` | timestamptz default now() | |

**Indexes:** `client_contracts(client_id, status)`, `client_contract_deliverables(contract_id)`.

**RLS:**
- `client_contracts` — admin role full access; viewer role denied (this feature is admin-only in v1).
- `client_contract_deliverables` — same.
- Storage bucket — RLS via `storage.objects` policy checking user role + client org membership.

### Derived services recompute

Logic in `lib/contracts/recompute-services.ts`:

```
recomputeClientServices(clientId):
  tags = distinct service_tag from client_contract_deliverables
         joined on client_contracts where client_id = clientId and status = 'active'
  clients.services = sorted(tags)
```

Called on: confirm, edit, status change, delete. Kept in application code (not a trigger) so it's debuggable and surfaces in usage metrics if needed later. Any other code that writes `clients.services` directly should be audited and removed as part of this work; this feature is the single writer going forward.

### Extraction pipeline

`lib/contracts/extract.ts`:

1. **Text extraction**
   - PDF → `pdf-parse` (already a transitive dep? confirm during implementation).
   - DOCX → `mammoth`.
   - TXT/MD → passthrough.
   - Other → 415 error.
2. **LLM call** via `lib/ai/client.ts` OpenRouter helper, model from `getDefaultOpenRouterModel()` (user confirmed: `gpt-5.4-mini`). JSON-only response, Zod-validated:
   ```ts
   z.object({
     services: z.array(z.string().min(1)).max(30),
     deliverables: z.array(z.object({
       service_tag: z.string().min(1),
       name: z.string().min(1),
       quantity_per_month: z.number().int().nonnegative(),
       notes: z.string().optional(),
     })).max(100),
     effective_start: z.string().date().optional(),
     effective_end: z.string().date().optional(),
     suggested_label: z.string().optional(),
   })
   ```
3. **Prompt** — system message explains: "Extract monthly-recurring deliverables only. Ignore one-time scoped work. Normalize service names to proper-case tags (Editing, SMM, Paid media). Quantity is per calendar month; convert annual to monthly where obvious." Full prompt text stored in `lib/contracts/extract.ts` with a `PROMPT_VERSION` constant for future iteration.
4. **Fallback** — if LLM returns unparseable JSON, return an empty draft + surface `parse_meta.error` so the review modal shows an empty form (admin still has the uploaded file; worst case they type it manually).

### UI

**`components/clients/contract/contract-page.tsx`** (client component)
- Header row: page title, **Upload contract** button.
- **Active services** chip row — reads from derived `clients.services`.
- **Deliverables** card — grouped by `service_tag`. Group header shows tag + total-qty-per-month across active contracts. Rows list `{name} — {qty}/mo` with a small badge when more than one active contract contributes.
- **Active contracts** list — rows: label, effective dates, file name (click → signed URL), overflow menu (Edit, End contract, Delete).
- **Past contracts** — collapsed by default; click to expand; rows render deliverables read-only.

**`components/clients/contract/upload-contract-modal.tsx`**
- Drag/drop area, progress, then review form with editable deliverable rows and service-tag combobox (autocomplete from this client's existing tags + org-wide tag set).
- Primary CTA: **Save**. Secondary: **Cancel** (discards the draft contract row + file).

**`components/clients/contract/edit-contract-modal.tsx`** — same review form, prefilled, save → PATCH.

### Permissions + security
- `users.role in ('admin','super_admin')` required on every route.
- `clients.organization_id === users.organization_id` check for non-super-admin admins if multi-org gets enforced (the pattern already exists — mirror it).
- Storage reads via signed URL, 60-second TTL.
- File size cap at upload (e.g., 20 MB) + mime allowlist.

## Edge cases
- Two active contracts with overlapping deliverables → union of service tags, deliverables listed separately (grouped by tag but labeled with contract label in the row).
- Uploading an already-ended contract (renewal arrives late) → admin sets status to `ended` in the review modal before saving; it goes straight to past contracts.
- Admin deletes all active contracts → `clients.services` becomes `[]`.
- Pre-existing free-text services (entered by humans before this feature shipped) are left untouched until the client's first contract is uploaded; at that point `clients.services` is overwritten by the recompute. No back-migration script — the first upload is the switchover per client.
- Extraction returns zero deliverables → review modal shows "No deliverables detected — add them manually?" with a blank row to start.
- File type unsupported → 415 with clear message; no contract row created.

## Testing
- Unit: Zod schemas, `recomputeClientServices` (several active/ended/deleted permutations), extraction prompt snapshot.
- API: route guards (auth + role + org scoping), confirm/patch/delete lifecycle.
- E2E (Playwright): admin uploads a fixture PDF → reviews → saves → deliverables visible → services chips reflect union → uploads a second contract → union grows → ends first contract → union shrinks.
- Security: portal viewer cannot see the tab or hit any `/api/clients/[slug]/contracts*` route.

## Open questions (deferred, not blocking)
- Does the parsed `suggested_label` default get auto-applied? Decision: yes, prefilled into label field; user can edit before saving.
- Do we need a "re-parse" button on an existing contract (e.g., prompt changed)? Decision: deferred to v2.
- Should the sidebar badge a number (e.g., count of active contracts)? Decision: deferred.

## File inventory (rough, for planning)

New:
- `supabase/migrations/<next>_client_contracts.sql`
- `lib/contracts/extract.ts`
- `lib/contracts/recompute-services.ts`
- `app/admin/clients/[slug]/contract/page.tsx`
- `app/api/clients/[slug]/contracts/route.ts`
- `app/api/clients/[slug]/contracts/[id]/route.ts`
- `app/api/clients/[slug]/contracts/[id]/confirm/route.ts`
- `components/clients/contract/contract-page.tsx`
- `components/clients/contract/upload-contract-modal.tsx`
- `components/clients/contract/edit-contract-modal.tsx`
- `tests/e2e/contract.spec.ts`

Modified:
- `lib/clients/admin-workspace-modules.ts` — add `'contract'` key + meta.
- `components/clients/client-admin-shell.tsx` (or wherever the sidebar renders) — add nav entry.
- Any code that currently writes to `clients.services` (audit + remove).
