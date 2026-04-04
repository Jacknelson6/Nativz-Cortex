import { test, expect } from '@playwright/test';
import { ADMIN_PROTECTED_ROUTES, PORTAL_PROTECTED_ROUTES } from './route-matrix';

/**
 * Unauthenticated browser: protected sections redirect to the correct login page.
 */
test.describe('Admin routes → login', () => {
  for (const path of ADMIN_PROTECTED_ROUTES) {
    test(`redirect ${path}`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(/\/admin\/login(\?|$)/);
    });
  }
});

test.describe('Portal routes → login', () => {
  for (const path of PORTAL_PROTECTED_ROUTES) {
    test(`redirect ${path}`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      // Unified login: portal routes redirect to /admin/login
      await expect(page).toHaveURL(/\/admin\/login(\?|$)/);
    });
  }
});

test.describe('Login pages stay put', () => {
  test('/admin/login does not redirect away when logged out', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/admin/login', { waitUntil: 'load' });
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.getByRole('heading', { name: /sign in to cortex/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('/portal/login redirects to unified login', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/portal/login', { waitUntil: 'load' });
    // Portal login now redirects to unified /admin/login
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.getByRole('heading', { name: /sign in to cortex/i })).toBeVisible({
      timeout: 15_000,
    });
  });
});

test.describe('Public portal join', () => {
  test('/portal/join/[token] loads (invalid token UI)', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/portal/join/e2e-invalid-token-placeholder');
    await expect(page.locator('body')).toBeVisible();
    // Still on join path (not kicked to login)
    await expect(page).toHaveURL(/\/portal\/join\//);
    expect(pageErrors).toEqual([]);
  });
});
