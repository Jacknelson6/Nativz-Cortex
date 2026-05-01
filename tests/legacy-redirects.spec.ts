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

/**
 * Tools-section legacy URLs — pages physically moved under /admin/tools/*
 * in April 2026 but these old paths still render a redirect shell. Logged-out
 * hits still bounce through /admin/login because the new canonical route is
 * also admin-protected; logged-in hits (covered in admin-authenticated-crawl)
 * land on the new URL. This suite only guarantees the old routes don't 404.
 */
test.describe('Tools section legacy redirects', () => {
  const legacyToNew: Array<[string, string]> = [
    ['/admin/accounting', '/admin/accounting'],
    ['/admin/users', '/admin/users'],
    ['/admin/settings/production-updates', '/admin/notifications'],
    ['/admin/team', '/admin/users'],
  ];
  for (const [legacy] of legacyToNew) {
    test(`${legacy} still responds (not 404)`, async ({ page }) => {
      const res = await page.goto(legacy, { waitUntil: 'domcontentloaded' });
      // Either a 2xx (logged-in redirect already chased) or a 3xx (redirect to
      // login first). 404 means the legacy route is genuinely gone.
      expect(res?.status(), `${legacy} returned ${res?.status()}`).toBeLessThan(404);
    });
  }
});
