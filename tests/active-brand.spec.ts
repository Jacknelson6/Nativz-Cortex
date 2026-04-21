import { test, expect } from '@playwright/test';
import { signInAsAdmin } from './admin-login-helpers';

/**
 * NAT-57 — top-level brand selector + tools that read the active-brand cookie.
 *
 * Two layers:
 *  1. API security — works without any login.
 *  2. Signed-in flow — requires E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD and
 *     at least one client in the admin's roster. Skipped otherwise.
 */

const email = process.env.E2E_ADMIN_EMAIL ?? '';
const password = process.env.E2E_ADMIN_PASSWORD ?? '';
const hasCreds = email.length > 0 && password.length > 0;

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// ---------------------------------------------------------------------------
// Layer 1 — API security (no auth required to run)
// ---------------------------------------------------------------------------

test.describe('POST /api/admin/active-client — auth + validation', () => {
  test('unauthenticated request returns 401', async ({ request }) => {
    const res = await request.post('/api/admin/active-client', {
      data: { client_id: '00000000-0000-0000-0000-000000000000' },
    });
    expect(res.status()).toBe(401);
    const json = await res.json().catch(() => ({}));
    expect(json).toMatchObject({ error: 'Unauthorized' });
  });

  test('unauthenticated request with null body still returns 401', async ({ request }) => {
    // Auth check should run BEFORE body validation — even a well-formed
    // "clear my selection" payload must not leak the 400-vs-401 distinction
    // to an unauthenticated caller.
    const res = await request.post('/api/admin/active-client', {
      data: { client_id: null },
    });
    expect(res.status()).toBe(401);
  });

  test('malformed body (no client_id) — auth check fires first', async ({ request }) => {
    const res = await request.post('/api/admin/active-client', {
      data: { not_a_client_id: 'hello' },
    });
    // Unauthenticated → 401 regardless of body shape.
    expect(res.status()).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Layer 2 — signed-in flow (requires admin creds)
// ---------------------------------------------------------------------------

test.describe('Admin active-brand flow', () => {
  test.skip(!hasCreds, 'Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD');

  test.describe.configure({ mode: 'serial', timeout: 5 * 60 * 1000 });

  test('top-bar pill renders on /admin/dashboard', async ({ page }) => {
    await page.context().clearCookies();
    await signInAsAdmin(page, email, password);
    await page.goto('/admin/dashboard', { waitUntil: 'domcontentloaded' });

    // The pill is a <button aria-haspopup="listbox"> inside the top bar.
    // Either "Select a brand" (no cookie) or a brand name (cookie) satisfies.
    const pill = page.getByRole('button', { name: /select a brand|brand context/i })
      .or(page.locator('button[aria-haspopup="listbox"]').first());
    await expect(pill).toBeVisible();
  });

  test('API round-trip: set a brand and verify it persists across pages', async ({ page, request }) => {
    await page.context().clearCookies();
    await signInAsAdmin(page, email, password);

    // Discover a brand id to switch to. /api/clients is authenticated + returns
    // the admin's visible roster; first active client is enough.
    const clientsRes = await request.get('/api/clients');
    expect(clientsRes.ok(), `GET /api/clients: ${clientsRes.status()}`).toBeTruthy();
    const clientsJson = (await clientsRes.json()) as { clients?: Array<{ id: string; is_active?: boolean }> };
    const target = (clientsJson.clients ?? []).find((c) => c.is_active !== false && typeof c.id === 'string');
    test.skip(!target, 'Need at least one active client in the admin roster to test the switcher');
    if (!target) return;

    // Set the cookie via the production API route.
    const setRes = await request.post('/api/admin/active-client', {
      data: { client_id: target.id },
    });
    expect(setRes.ok(), `set-active-client: ${setRes.status()}`).toBeTruthy();
    const setJson = (await setRes.json()) as { ok?: boolean; client_id?: string };
    expect(setJson).toMatchObject({ ok: true, client_id: target.id });

    // Cookie should be readable from the page's context now.
    const cookies = await page.context().cookies();
    const brandCookie = cookies.find((c) => c.name === 'x-admin-active-client');
    expect(brandCookie?.value).toBe(target.id);

    // Strategy Lab index should redirect to /admin/strategy-lab/<target.id>
    // now that the cookie is set.
    await page.goto('/admin/strategy-lab', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(new RegExp(`/admin/strategy-lab/${target.id}`));

    // Ad Creatives v2 index should redirect the same way.
    await page.goto('/admin/ad-creatives-v2', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(new RegExp(`/admin/ad-creatives-v2/${target.id}`));
  });

  test('clearing the brand cookie returns the index pages to their fallback', async ({ page, request }) => {
    await page.context().clearCookies();
    await signInAsAdmin(page, email, password);

    // Start with NO cookie — explicitly clear via the API.
    const clearRes = await request.post('/api/admin/active-client', {
      data: { client_id: null },
    });
    expect(clearRes.ok(), `clear-active-client: ${clearRes.status()}`).toBeTruthy();

    // Strategy Lab with no cookie stays on /admin/strategy-lab (fallback
    // cross-brand chat) — no redirect to any [clientId].
    await page.goto('/admin/strategy-lab', { waitUntil: 'domcontentloaded' });
    expect(page.url()).not.toMatch(new RegExp(`/admin/strategy-lab/${UUID_RE.source}`));
  });

  test('POST /api/admin/active-client rejects a brand the user cannot see (403)', async ({ page, request }) => {
    await page.context().clearCookies();
    await signInAsAdmin(page, email, password);

    // Well-formed UUID that doesn't exist in any agency's roster.
    const bogusUuid = '00000000-0000-0000-0000-000000000000';
    const res = await request.post('/api/admin/active-client', {
      data: { client_id: bogusUuid },
    });
    expect(res.status()).toBe(403);
  });
});
