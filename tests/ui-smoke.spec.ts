import { test, expect } from '@playwright/test';

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

    // Hydration / chunk failures show up here
    expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
  });
});

test.describe('Portal login shell', () => {
  test('uses design-system card, inputs, and primary button', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.context().clearCookies();
    await page.goto('/portal/login', { waitUntil: 'load' });
    await expect(page.getByText(/client portal sign in/i)).toBeVisible({ timeout: 15_000 });

    const card = page.locator('.rounded-xl.border.border-nativz-border.bg-surface').first();
    await expect(card).toBeVisible();

    await expect(page.getByLabel(/^email$/i)).toBeVisible();
    await expect(page.getByLabel(/^password$/i)).toBeVisible();

    const submit = page.getByRole('button', { name: /^sign in$/i });
    await expect(submit).toBeVisible();
    await expect(submit).toHaveClass(/btn-shimmer/);

    expect(errors.filter((e) => !e.includes('favicon'))).toEqual([]);
  });
});
