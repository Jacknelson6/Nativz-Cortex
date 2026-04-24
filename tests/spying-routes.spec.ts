import { test, expect } from '@playwright/test';

/**
 * Route smoke tests for the Spying + Trend Finder monitors
 * surfaces shipped 2026-04-22. Logged-out hits should redirect to login
 * without 404ing. Logged-in crawling is covered by the admin crawl spec once
 * the admin-login-helpers are set up with a real cookie.
 */

const NEW_ROUTES = [
  // Spying (NAT-62)
  '/spying',
  '/spying/watch',
  '/spying/reports',
  '/spying/reports/new',
  // Trend Finder monitors (2026-04-22 evening)
  '/finder/monitors',
  '/finder/monitors/new',
  // Infrastructure v2 (NAT-61) — tab variations
  '/admin/usage?tab=overview',
  '/admin/usage?tab=topic-search',
  '/admin/usage?tab=ai-providers',
  '/admin/usage?tab=crons',
  '/admin/usage?tab=integrations',
  '/admin/usage?tab=database',
];

test.describe('Spying + monitors — route smoke', () => {
  for (const route of NEW_ROUTES) {
    test(`${route} responds without 404`, async ({ page }) => {
      const res = await page.goto(route, { waitUntil: 'domcontentloaded' });
      expect(res?.status(), `${route} returned ${res?.status()}`).toBeLessThan(404);
      // Logged-out: we expect to end up on login. Logged-in: we stay.
      // Either way the path should not be the error boundary.
      await expect(page.locator('text=/application error/i')).toHaveCount(0);
    });
  }
});

test.describe('Spying audits redirects', () => {
  test('/spying/audits → /admin/analyze-social', async ({ page }) => {
    await page.goto('/spying/audits', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/admin\/(analyze-social|login)/);
  });

  test('/spying/audits/[id] → /admin/analyze-social/[id]', async ({ page }) => {
    await page.goto('/spying/audits/00000000-0000-0000-0000-000000000000', {
      waitUntil: 'domcontentloaded',
    });
    await expect(page).toHaveURL(/\/admin\/(analyze-social|login)/);
  });
});

test.describe('Reporting API surface — unauthenticated guards', () => {
  const guardedGets = [
    '/api/competitor-reports/subscriptions',
    '/api/competitor-reports',
    '/api/trend-reports/subscriptions',
    '/api/trend-reports',
  ];
  for (const route of guardedGets) {
    test(`GET ${route} requires auth`, async ({ request }) => {
      const res = await request.get(route);
      expect([401, 403]).toContain(res.status());
    });
  }

  const cronsRequireBearer = [
    '/api/cron/competitor-reports',
    '/api/cron/trend-reports',
  ];
  for (const route of cronsRequireBearer) {
    test(`GET ${route} without bearer → 401`, async ({ request }) => {
      const res = await request.get(route);
      expect(res.status()).toBe(401);
    });
  }
});
