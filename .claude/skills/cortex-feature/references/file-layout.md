# File layout

Where files go based on feature type.

## Admin feature

| Layer | Path |
|-------|------|
| Page | `app/admin/<section>/page.tsx` |
| API route | `app/api/<domain>/route.ts` |
| Lib logic | `lib/<domain>/<feature>.ts` |
| Types | `lib/<domain>/types.ts` or `lib/types/<domain>.ts` |
| Components | `components/<domain>/<Feature>.tsx` |

Existing admin sections: `analysis`, `analytics`, `calendar`, `clients`, `dashboard`, `ideas`, `knowledge`, `meetings`, `nerd`, `pipeline`, `presentations`, `scheduler`, `search`, `settings`, `shoots`, `tasks`, `team`

## Portal feature

| Layer | Path |
|-------|------|
| Page | `app/portal/<section>/page.tsx` |
| API route | `app/api/portal/<domain>/route.ts` |
| Lib logic | `lib/<domain>/<feature>.ts` or `lib/portal/<feature>.ts` |
| Types | `lib/<domain>/types.ts` or `lib/types/<domain>.ts` |
| Components | `components/portal/<domain>/<Feature>.tsx` |

Existing portal sections: `analyze`, `brand`, `calendar`, `dashboard`, `ideas`, `knowledge`, `notifications`, `preferences`, `reports`, `search`, `settings`

Existing portal API domains: `brand-dna`, `knowledge`

## Shared feature

| Layer | Path |
|-------|------|
| API route | `app/api/shared/<domain>/route.ts` |
| Lib logic | `lib/<domain>/<feature>.ts` |

Shared routes use token-based auth (manual verification). Existing shared domains: `moodboard`, `search`

## Background job / cron

| Layer | Path |
|-------|------|
| API route | `app/api/cron/<name>/route.ts` |
| Lib logic | `lib/<domain>/<feature>.ts` |
| No UI | -- |

Existing cron jobs: `check-velocity`, `data-retention`, `fyxer-import`, `publish-posts`, `shoot-planner`, `sync-affiliates`, `sync-reporting`

## Types placement

Check which pattern the domain already uses before creating a new types file:
- Domain-local: `lib/<domain>/types.ts` (e.g. `lib/search/types.ts`)
- Centralized: `lib/types/<domain>.ts` (e.g. `lib/types/search.ts`)

Existing centralized types: `database`, `moodboard`, `notification-preferences`, `reporting`, `scheduler`, `search`, `strategy`

## Component organization

Components mirror the domain structure. Existing top-level component directories:

`ad-creatives`, `affiliates`, `ai`, `analytics`, `brand-dna`, `calendar`, `charts`, `clients`, `dashboard`, `ideas`, `ideas-hub`, `knowledge`, `meetings`, `moodboard`, `nerd`, `pipeline`, `portal`, `preferences`, `reporting`, `reports`, `research`, `results`, `scheduler`, `search`, `settings`, `shared`, `shoots`, `tasks`, `team`, `ui`
