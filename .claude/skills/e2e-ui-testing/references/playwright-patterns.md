# Playwright patterns in this repo

This file is the concrete, repo-specific companion to SKILL.md. It documents how E2E tests are actually wired in Nativz Cortex today, the conventions that have earned their keep, and the failure modes we have hit and learned from. Read this before adding a new spec to `tests/`.

## Where things live

```
tests/
├── global-setup.ts            seeds org/client/admin, signs in, writes .auth/
├── global-teardown.ts         tears down fixtures
├── .auth/admin.json           saved storageState (signed-in admin session)
├── .auth/test-data.json       fixture ids: clientId, adminEmail, adminUserId
├── admin-login-helpers.ts     signInAsAdmin() — used inside specs that need a
│                              fresh session or to drive UI sign-in flows
├── e2e-helpers.ts             shared utilities (route matrix, factories)
├── cup-01-handoff.spec.ts     example: drop handoff happy path
├── cup-03-review.spec.ts      example: full SMM review lifecycle, hermetic
└── ...
```

`playwright.config.ts` points `globalSetup` at `tests/global-setup.ts` and `storageState` at `tests/.auth/admin.json`. The admin session is preloaded into the browser context for every spec, so most specs do not need to log in again.

## The hermetic seed/teardown pattern

The reference shape is `tests/cup-03-review.spec.ts`. Every test that touches DB rows should follow this skeleton:

```ts
test('...', async ({ page }) => {
  const data = getTestData();           // pull adminUserId + clientId from .auth/
  const db = adminClient();             // service-role client, bypasses RLS

  const seeded = await seedDrop(db, { clientId: data.clientId, userId: data.adminUserId });
  const contactId = await seedContact(db, data.clientId);

  try {
    await signInAsAdmin(page, data.adminEmail, data.adminPassword);
    // ... run the spec ...
  } finally {
    await cleanupDrop(db, seeded.dropId, seeded.postId);
    await db.from('contacts').delete().eq('id', contactId);
  }
});
```

Three properties this gives you:

1. **Idempotent.** Re-run the spec a hundred times, the DB is unchanged.
2. **Parallel-safe.** No two runs share rows.
3. **Diagnosable.** A failure leaves no residue to confuse the next run.

When you write a new spec, copy this skeleton first and modify it; do not start from a blank file. Drift from this pattern is how state leaks back into the suite.

## Driving routes via `page.request`

When the goal is to exercise a route handler and assert the resulting DB state, prefer `page.request.post(...)` / `page.request.get(...)` over clicking through the UI. It is faster, it uses the same auth as a real session (because the storageState includes the auth cookie), and the assertion surface is just the response status + the DB row.

UI walking is for tests where the goal really is the UI. Form interactions, locator stability, rendered state. Do not click through five pages to exercise a route you could POST directly.

`cup-03-review.spec.ts` is a clean example of the request-driven shape: POST the handoff endpoints, then read the row back via the admin client and assert.

## The phantom-column failure mode

A real lesson from `cup-03-review.spec.ts`. The lifecycle test was failing on the 4th transition with a 404 from `/admin/calendar/review/[token]`. The page was returning `notFound()`. Why?

The page was querying a column that did not exist:

```ts
// app/admin/calendar/review/[token]/page.tsx — BROKEN
.select('id, token, drop_id, included_post_ids, revoked')
```

`revoked` is not a column on `content_drop_share_links`. The actual archive flag is `archived_at` (added in migration 202). Supabase, when given a select referencing a non-existent column with `.maybeSingle()` or `.single()`, returns `data: null` with *no error thrown*. The page then sees `if (!link) notFound()` and 404s. The test had no way to know whether the issue was a bad token, an auth problem, or a phantom column.

Lessons that hardened the suite:

1. **Silent nulls are the worst failure mode.** A typo in a column name has the same observable signature as a legitimately missing row. Both routes through the page were patched: `app/admin/calendar/review/drop/[id]/page.tsx` and `app/admin/calendar/review/[token]/page.tsx`. Fix landed in `e9f7b3b9`.
2. **Diagnose with `page.request.get` against the actual route, not by reading the source.** If the route returns 404, you can rule out the test setup before suspecting the page.
3. **When a route 404s and the seed says the row exists, the next move is to query the *same columns* the page is querying** — directly via the admin client. If the admin client also gets `null`, the page query is wrong, not the data.
4. **Generated types catch this at compile time.** Run `npm run db:types` and use the generated types in the page interfaces so a missing column is a TS error, not a runtime null.

If you see a page returning 404 in a test and you know the row exists, suspect a phantom column before suspecting anything else.

## `globalSetup` does the heavy lifting

`tests/global-setup.ts` creates a test organization, a test client, a test admin user, and signs that admin in via the UI. The signed-in storage state is saved to `tests/.auth/admin.json`. Fixture ids land in `tests/.auth/test-data.json`.

Specs read from `test-data.json` rather than reseeding fixtures. The only reason to reseed in a spec is row-level data scoped to that spec (a drop, a post, a contact, etc.).

If a spec needs *another* user (a viewer, a different admin), seed that user inside the spec and clean it up in `finally`. Do not pollute the global fixture set with one-off users; the global fixtures are for the things every spec needs.

## Common pitfalls (real ones we have hit)

### Querying non-existent DB columns silently

Covered above. The TL;DR: when a Supabase select includes a column that does not exist, `.maybeSingle()` returns `null` with no error and the caller probably calls `notFound()`. Use generated types.

### Relying on text that the copywriter just changed

`getByText('Send to client')` breaks when the copy team renames the button to "Send for review." Prefer `getByRole('button', { name: /send/i })` and accept the variant.

### Tests that depend on order

If `test('A')` seeds a row that `test('B')` reads, you have invented a dependency that will bite during parallel runs. Each spec must seed its own data.

### Forgetting `finally`

A test that throws halfway through and never cleans up leaves orphan rows. Every seed goes in `try`, every cleanup in `finally`. No exceptions.

### Asserting on exact toast text

UI copy changes constantly. Assert on *behavior* (the row updated, the URL changed, the next page rendered) and assert on the *presence* of a toast role, not its text. If you really need to assert text, use a regex with the stem (`/sent for review/i`).

### `waitForTimeout`

Never. Replace with `waitFor` against an actual signal (DOM, network, AOM change).

### Sharing browser context across crews

The storageState is shared between specs (that is the point), but the *browser context* is fresh per worker. Do not stash mutable state on `page` or in module-level variables that survive between specs. Each spec is an island.

## Adding a new spec — checklist

1. Copy the cup-03 skeleton.
2. Replace the seed/teardown with the rows your spec needs.
3. Drive through `page.request` if the goal is route behavior + DB state; drive through `page` if the goal is UI behavior.
4. Use the `getByRole` / `getByLabel` ladder for locators.
5. Assert on DB rows or response status, not on rendered string equality.
6. `finally` blocks delete everything you seeded.
7. Run `npm run test:e2e -- tests/your-new.spec.ts` locally before opening a PR.

## When to break the request-only pattern

The request-only pattern is great for state transitions but blind to actual rendering. For surfaces where the test is "the SMM looks at the review page and it has the right thing on it," you need to drive the UI:

- Render the page with `page.goto`.
- Wait for a stable AOM node that proves the data loaded.
- Read the AOM snapshot and assert against intent.

The shape that has worked: route-driven for the state machine, UI-driven for the rendering check. cup-03 currently asserts route + status. A natural extension is a follow-up spec that loads the rendered page and asserts the post list, the action bar variant, and the history entries are visible.

## Where to file new test infrastructure

- Cross-spec helpers → `tests/e2e-helpers.ts`.
- Auth helpers → `tests/admin-login-helpers.ts` (extend, do not fork).
- Route matrices → `tests/route-matrix.ts`.
- New fixture types that *every* spec needs → into `global-setup.ts` (rare; usually a spec-local seed is correct).
