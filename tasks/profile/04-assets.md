# PRD 04 — Assets

## Goal

A single home for every file ever handed over by the client: brand assets uploaded by an admin, footage uploaded during onboarding, logos, guidelines, fonts, reference photos.

## Data model

Already in place from migration 319:

- `client_brand_assets` — id, client_id, label, category, storage_path, file_name, mime_type, size_bytes, note, uploaded_by, created_at
- `brand-assets` private bucket — admin-only RLS

Legacy `onboarding_uploads` rows are surfaced read-only in the UI (download only, no delete from here) — see the existing `InfoBrandAssetsCard` source-aware rendering.

## UI spec

Port `InfoBrandAssetsCard` (`components/clients/settings/info-brand-assets-card.tsx`) into the new chrome:

- `SettingsPageHeader` (Archive icon, "Assets")
- One `WorkspaceSection` per category (Footage / Logo / Guideline / Photo / Font / Other) with an "Add" button in the header
- Drag-drop zone at the top spans all categories; new uploads default to `other` until categorized via the row menu
- Each asset row: icon + label/filename, size · uploaded-by · created-at, download + delete (delete locked for `onboarding_upload` source with a Lock icon tooltip)

## API

Existing — no changes needed:
- `GET /api/clients/[id]/brand-assets` — returns unified list (`source: 'brand_asset' | 'onboarding_upload'`)
- `POST /api/clients/[id]/brand-assets` — multipart upload
- `DELETE /api/clients/[id]/brand-assets/[assetId]`
- `GET /api/clients/[id]/brand-assets/[assetId]/signed-url?source=brand_asset|onboarding_upload`

Add:
- `PATCH /api/clients/[id]/brand-assets/[assetId]` — accepts `{ category?, label?, note? }` for the new categorize-from-row UI

## Done criteria

- [ ] Page renders grouped by category with empty-state per group.
- [ ] Onboarding-source rows still show the "Onboarding" badge + Lock icon.
- [ ] Drag-drop uploads default to `other` and surface a "Categorize" pill on the new row.
- [ ] Migration 320 (or later) is NOT required — schema is already correct.

## Out of scope

- Mux video preview — assets are downloads-only here. Editing-project videos live in their own section per the "Video content lives on Mux" rule.
