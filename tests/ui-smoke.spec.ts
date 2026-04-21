import { test, expect } from '@playwright/test';
import { filterCriticalConsoleErrors } from './e2e-helpers';

/**
 * Cortex UI smoke — public / auth shells only (no credentials).
 * Run with dev server: `npm run dev` then `npm run test:e2e`
 *
 * Component alignment: Northstone / shadcn pipeline uses `components.json` registries
 * (@ss-components, @ss-blocks from shadcnstudio.com) + primitives in `components/ui/*`.
 */

test.describe('Health', () => {
  test('API health responds', async ({ request }) => {
    let lastStatus = 0;
    for (let i = 0; i < 5; i++) {
      const res = await request.get('/api/health');
      lastStatus = res.status();
      if (res.ok()) {
        const json = await res.json();
        expect(json).toMatchObject({ status: 'ok' });
        return;
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    expect(lastStatus, 'GET /api/health never returned 2xx').toBe(200);
  });
});

test.describe('Admin login shell', () => {
  test('loads sign-in form without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.context().clearCookies();
    await page.goto('/admin/login', { waitUntil: 'load' });
    await expect(page.getByRole('heading', { name: /sign in to cortex/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel(/^email$/i)).toBeVisible();
    await expect(page.getByLabel(/^password$/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /^sign in$/i })).toBeVisible();

    expect(filterCriticalConsoleErrors(errors)).toEqual([]);
  });
});

test.describe('Portal login redirect', () => {
  // `/portal/login` was retired in favor of the unified admin login. This
  // test used to assert "Client portal sign in" card UI; now we assert the
  // redirect instead (same rule exercised in routes-redirects.spec.ts but
  // also worth catching here so the ui-smoke suite doesn't rot silently).
  test('/portal/login redirects into the unified admin login shell', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.context().clearCookies();
    await page.goto('/portal/login', { waitUntil: 'load' });

    // Landed somewhere under /admin/login (path may carry a redirect param).
    expect(page.url()).toMatch(/\/admin\/login(\?|$)/);

    // Unified login chrome should be visible on the destination page.
    await expect(page.getByText(/sign in to cortex/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel(/^email$/i)).toBeVisible();
    await expect(page.getByLabel(/^password$/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /^sign in$/i })).toBeVisible();

    expect(filterCriticalConsoleErrors(errors)).toEqual([]);
  });
});
