import { test, expect } from '@playwright/test';

/** Legacy entry points from middleware — should land on admin login. */
test.describe('Legacy redirects', () => {
  for (const path of ['/', '/login', '/history']) {
    test(`${path} → /admin/login`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(/\/admin\/login/);
    });
  }
});
