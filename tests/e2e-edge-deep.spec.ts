import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  ADMIN_E2E_FULL_STATIC_ROUTES,
  ADMIN_PROTECTED_ROUTES,
  PORTAL_PROTECTED_ROUTES,
} from './route-matrix';

/** GET endpoints that must return 401 + Unauthorized JSON when no session cookie is sent. */
const UNAUTHORIZED_GET_PATHS: { path: string; note?: string }[] = [
  { path: '/api/clients' },
  { path: '/api/research/history?limit=5' },
  { path: '/api/presentations' },
  { path: '/api/tasks' },
  { path: '/api/team' },
  { path: '/api/settings/openrouter-models' },
  { path: '/api/pipeline/summary' },
  { path: '/api/notifications/preferences' },
];

async function expectUnauthorizedJson(request: APIRequestContext, path: string) {
  const res = await request.get(path);
  expect(res.status(), `${path} status`).toBe(401);
  const json = await res.json().catch(() => ({}));
  expect(json, `${path} body`).toMatchObject({ error: 'Unauthorized' });
}

test.describe('Deep — API without session', () => {
  for (const { path, note } of UNAUTHORIZED_GET_PATHS) {
    test(`GET ${path} → 401 Unauthorized${note ? ` (${note})` : ''}`, async ({ request }) => {
      await expectUnauthorizedJson(request, path);
    });
  }

  test('GET /api/health stays public with odd Accept header', async ({ request }) => {
    const res = await request.get('/api/health', { headers: { Accept: '*/*' } });
    expect(res.ok()).toBeTruthy();
    expect(await res.json()).toMatchObject({ status: 'ok' });
  });

  test('POST /api/clients without session → 401', async ({ request }) => {
    const res = await request.post('/api/clients', {
      data: { name: 'x' },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(401);
    const json = await res.json().catch(() => ({}));
    expect(json).toMatchObject({ error: 'Unauthorized' });
  });

  test('POST /api/tasks with invalid JSON body → 401 (auth runs before body parse)', async ({ request }) => {
    const res = await request.post('/api/tasks', {
      data: 'not-json{',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(401);
    const json = await res.json().catch(() => ({}));
    expect(json).toMatchObject({ error: 'Unauthorized' });
  });
});

test.describe('Deep — unauthenticated browser edge cases', () => {
  test('admin login: empty submit keeps page on /admin/login (HTML5 validation)', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/admin/login', { waitUntil: 'load' });
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/admin\/login/);
    const emailValid = await page.locator('#email').evaluate((el: HTMLInputElement) => el.checkValidity());
    expect(emailValid, 'email should fail constraint without value').toBe(false);
  });

  test('admin login: malformed email fails built-in validation before network', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/admin/login', { waitUntil: 'load' });
    await page.locator('#email').fill('not-an-email');
    await page.locator('#password').fill('x');
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/admin\/login/);
    const valid = await page.locator('#email').evaluate((el: HTMLInputElement) => el.checkValidity());
    expect(valid, 'type=email should reject').toBe(false);
  });

  test('admin login URL with query string still renders form', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/admin/login?next=%2Fadmin%2Fdashboard', { waitUntil: 'load' });
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.getByRole('heading', { name: /sign in to cortex/i })).toBeVisible({ timeout: 15_000 });
  });

  test('rapid sequential protected navigations all end at login', async ({ page }) => {
    await page.context().clearCookies();
    const sample = [
      ADMIN_PROTECTED_ROUTES[0],
      ADMIN_PROTECTED_ROUTES[Math.min(3, ADMIN_PROTECTED_ROUTES.length - 1)],
      '/admin/settings',
    ];
    for (const path of sample) {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(/\/admin\/login(\?|$)/);
    }
  });

  test('portal protected sample redirects to portal login', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(PORTAL_PROTECTED_ROUTES[0], { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/portal\/login(\?|$)/);
  });
});

test.describe('Deep — route matrix sanity', () => {
  test('admin protected list has no duplicate paths', () => {
    const set = new Set(ADMIN_PROTECTED_ROUTES);
    expect(set.size).toBe(ADMIN_PROTECTED_ROUTES.length);
  });

  test('full static crawl list includes /admin/content-lab', () => {
    expect(ADMIN_E2E_FULL_STATIC_ROUTES).toContain('/admin/content-lab');
  });

  test('full static crawl omits bare /admin/analytics (redirect-only)', () => {
    expect(ADMIN_E2E_FULL_STATIC_ROUTES).not.toContain('/admin/analytics');
    expect(ADMIN_E2E_FULL_STATIC_ROUTES).toContain('/admin/analytics/social');
  });
});
