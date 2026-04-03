import { test, expect } from '@playwright/test';
import { PORTAL_E2E_FULL_STATIC_ROUTES } from './route-matrix';
import { filterCriticalConsoleErrors } from './e2e-helpers';

const email = process.env.E2E_PORTAL_EMAIL ?? '';
const password = process.env.E2E_PORTAL_PASSWORD ?? '';
const hasCreds = email.length > 0 && password.length > 0;

/**
 * Viewer portal: sign in and load **every** static portal route.
 *
 *   E2E_PORTAL_EMAIL=… E2E_PORTAL_PASSWORD=… npm run test:e2e
 */
test.describe('Portal full journey', () => {
  test.skip(!hasCreds, 'Set E2E_PORTAL_EMAIL and E2E_PORTAL_PASSWORD');

  test.describe.configure({ mode: 'serial', timeout: 12 * 60 * 1000 });

  test('login → all static portal routes', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.context().clearCookies();
    await page.goto('/portal/login', { waitUntil: 'load' });
    await page.getByLabel(/^email$/i).fill(email);
    await page.getByLabel(/^password$/i).fill(password);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/portal\/search\/new/, { timeout: 60_000 });

    const visited = new Set<string>();
    for (const path of [...new Set(PORTAL_E2E_FULL_STATIC_ROUTES)]) {
      if (visited.has(path)) continue;
      visited.add(path);
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      expect(page.url(), `bounced to login from ${path}`).not.toMatch(/\/portal\/login(\?|$)/);
      await expect(page.locator('body')).toBeVisible();
    }

    const bad = filterCriticalConsoleErrors(errors);
    expect(bad, `Console errors:\n${bad.join('\n')}`).toEqual([]);
  });
});
