# Ad Creatives v2 — v1 Deprecation Checklist

**Status:** In progress — v2 is live alongside v1 (strangler pattern).
**Goal:** Delete the v1 ad-generation pipeline once every active client has migrated to v2.
**Reference:** `~/Desktop/morning-ads/CORTEX-MIGRATION-PRD.md`

This checklist documents the exact sequence for completing Slice 4 of the
PRD. **Do not skip steps.** The strangler pattern protects mid-campaign
clients — deleting v1 before migration is complete will break production ads.

---

## Phase A — Per-client migration (sequential, one client at a time)

For each active client currently using v1:

### A1. Activate v2 for the client

Run the appropriate seed script (or author a new one for untested clients):

```bash
npx tsx scripts/seed-ad-creatives-v2-<client>.ts
```

Seed scripts register layouts in `brand_ad_templates` and sanity-check
`brand_dna.logos` / `brand_fonts`.

### A2. Upload missing brand assets

If the seed script warns about missing logos or fonts:

- **Logos:** add entries to `brand_dna.logos` with `{ colorway, storage_path, bucket }` for each lockup variant the templates reference (e.g. `white-full`, `navy-full`, `gold-white`).
- **Fonts:** upload .otf / .ttf to the `brand-fonts` Supabase Storage bucket at path `<client_id>/<alias>-<weight>.otf` and insert a `brand_fonts` row per weight/style.
- **Scene photos (optional):** generate via `POST /api/ad-creatives-v2/generate-scene` if the client doesn't have product photography.

### A3. Verify a single-concept render

From the admin UI (`/admin/ad-creatives-v2/<clientId>`), use the "Render
preview" form to render at least one concept per activated layout. Verify:

- [ ] Logo renders in the correct colorway + scale
- [ ] Typography matches brand DNA (family, weight, tracking, color emphasis)
- [ ] Photo (if used) renders without distortion / overlap with text
- [ ] Gradient overlays produce legible headline zones
- [ ] Aspect ratio is correct (1:1 for Meta feed)

### A4. Run a small batch (5–10 concepts)

From the admin UI, create a batch of 5–10 concepts spanning every activated
template. Verify:

- [ ] All concepts render successfully (no failures in batch status)
- [ ] PNGs land in the `ad-creatives` Supabase Storage bucket
- [ ] `ad_creatives` rows are inserted with `metadata.pipeline = 'v2'`
- [ ] Batch status transitions `queued` → `generating` → `completed`

### A5. Client-side review

Send the media buyer (or the client directly) the batch output URLs. Obtain
explicit sign-off that the output quality matches or exceeds v1 before
proceeding.

### A6. Mark client as migrated

Document the client as migrated — currently via a commented entry in this
file. Future: add `clients.ad_pipeline_version` column and set it to `v2`.

**Migrated clients (as of writing):**
- [ ] Weston Funding — activated, pending first batch verification
- [ ] Goldback — activated, pending Goldback-specific renderer port + Borax font upload
- [ ] _(add remaining clients as they migrate)_

---

## Phase B — Surface audit

Once every active client appears in the migrated list above:

### B1. Run the v1 references audit

```bash
npx tsx scripts/v1-references-audit.ts
```

This outputs a punch list of files that still import from `lib/ad-creatives/`
or call `/api/ad-creatives/*`. **Do not proceed until this list is empty**
(or explicitly approved — e.g. if a scraping utility under
`lib/ad-creatives/scrape-brand.ts` is legitimately reused by v2, move it to
`lib/brand/scrape-brand.ts` rather than leaving it in v1).

### B2. Manual review of the admin UI

Walk through the v1 admin routes (`/admin/ad-creatives`, `/admin/ad-creatives/<clientId>`)
and confirm:

- [ ] No client-facing links remain
- [ ] No documentation refers to v1 as the primary flow
- [ ] Any in-progress batches have completed

---

## Phase C — v1 deletion (irreversible — only after Phase B is clean)

### C1. Delete v1 code

Each of these is a separate commit for bisectability:

1. `git rm -r app/api/ad-creatives/` (except any routes explicitly kept — e.g. scraping endpoints that aren't v1-specific)
2. `git rm -r app/admin/ad-creatives/` (the v1 admin flow)
3. `git rm -r components/ad-creatives/`
4. `git rm -r lib/ad-creatives/` (keep `lib/ad-creatives/scrape-brand.ts` if it's used by v2 — move it to `lib/brand/` first)
5. `git rm lib/ad-creatives/nano-banana/` (the global Nano Banana catalog)

### C2. Deprecate v1 tables

Add a migration dropping:

- `ad_prompt_templates`
- Any v1-only columns on `ad_generation_batches.config` (none expected — v1 and v2 share the table by design)

Keep `ad_generation_batches` + `ad_creatives` — they're shared tables.

### C3. Rename v2 → primary

Final rename commit:

- `lib/ad-creatives-v2/` → `lib/ad-creatives/`
- `app/api/ad-creatives-v2/` → `app/api/ad-creatives/`
- `app/admin/ad-creatives-v2/` → `app/admin/ad-creatives/`
- `components/ad-creatives-v2/` → `components/ad-creatives/`
- Update all imports (grep + sed)

This commit ends the strangler migration. v2 is now simply the pipeline.

### C4. Delete this checklist

```bash
git rm docs/ad-creatives-v2-deprecation-checklist.md
```

---

## Safety net — rollback plan

If production breaks after a Phase C step:

1. Revert the deletion commits (`git revert <sha>`)
2. Redeploy
3. Diagnose and re-attempt with a smaller scope

Because `ad_generation_batches` and `ad_creatives` are shared tables, v1
data isn't lost when v1 code is deleted. Only the rendering path
disappears. Old v1-generated creatives stay in storage and remain visible
via the reporting surfaces.

---

## Effort estimate

- Phase A (per client): ~1 hour per client end-to-end (activation + batch + sign-off)
- Phase B (audit + admin cleanup): ~2 hours
- Phase C (deletion + rename): ~4 hours including rollback verification

Whole of Phase A + B + C is bounded by **Phase A × active client count**.
If there are 10 active clients, budget 10–15 hours of linear work for
Phase A, then 6 hours for B + C = ~2 working days.
