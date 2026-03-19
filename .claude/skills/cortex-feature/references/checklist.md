# Pre-flight checklist

Run through this before finishing a feature.

## API layer

- [ ] Route uses correct variant (standard / admin / portal / cron / public)
- [ ] Zod schema covers all input fields
- [ ] Auth check runs before any data access
- [ ] Portal routes scope queries by `organization_id`
- [ ] AI response fields are null-safe (`?? []`, `?? ''`, `?? 0`)
- [ ] `logUsage()` wired if an external service is called (TrackedService enum)
- [ ] `maxDuration` exported if route is long-running (AI, crawl, scrape)
- [ ] Dynamic params use `Promise<{ id: string }>` and `await params`
- [ ] Returns `NextResponse.json()` with proper status codes

## UI layer

- [ ] Loading state shown while data fetches
- [ ] Error state with "what happened + what to do next" message
- [ ] Empty state with guidance on what the user should do
- [ ] Dark theme tokens used (`bg-surface`, `text-text-primary`, `text-text-secondary`, `text-text-muted`, `border-nativz-border`) -- no raw hex colors
- [ ] Sentence case on all UI copy (only capitalize first word + proper nouns)
- [ ] Component is `'use client'` only if it needs interactivity (state, effects, event handlers)
- [ ] Charts always have `'use client'`
- [ ] Button labels start with a verb and name the specific action

## Architecture

- [ ] Types shared between API and UI (not duplicated in both layers)
- [ ] Types placed in existing pattern (`lib/<domain>/types.ts` or `lib/types/<domain>.ts`)
- [ ] Lib function has typed inputs and outputs
- [ ] Admin routes use `createAdminClient()` for service-role operations
- [ ] Component placed in correct directory (`components/<domain>/` or `components/portal/<domain>/`)

## Final pass

- [ ] `npm run build` passes (or at minimum `npx tsc --noEmit`)
- [ ] No unused imports or dead code
- [ ] Feature works in both Nativz and Anderson Collaborative brand modes (no hardcoded brand colors)
