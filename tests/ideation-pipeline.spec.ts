import { test, expect } from '@playwright/test';
import { fetchJson } from './e2e-helpers';
import { signInAsAdmin } from './admin-login-helpers';

const email = process.env.E2E_ADMIN_EMAIL ?? '';
const password = process.env.E2E_ADMIN_PASSWORD ?? '';
const hasCreds = email.length > 0 && password.length > 0;

type HistoryItem = { href: string; status: string; type: string };
type HistoryResponse = { items: HistoryItem[] };

/**
 * Ideation pipeline: topic search results show pipeline UI; research hub loads.
 * Requires E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (same as admin full journey).
 */
test.describe('Ideation pipeline', () => {
  test.skip(!hasCreds, 'Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD');
  test.describe.configure({ timeout: 90_000 });

  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await signInAsAdmin(page, email, password);
  });

  test('research hub loads after login', async ({ page }) => {
    await page.goto('/finder/new', { waitUntil: 'domcontentloaded' });
    expect(page.url()).not.toMatch(/\/admin\/login(\?|$)/);
    await expect(page.locator('body')).toBeVisible();
    // Research hub or dual-mode UI
    await expect(
      page.getByRole('heading', { name: /What would you like to research today/i }),
    ).toBeVisible({ timeout: 30_000 });
  });

  test('completed topic search shows ideation pipeline', async ({ page }) => {
    const history = await fetchJson<HistoryResponse>(page.request, '/api/research/history?limit=40');
    const completed = (history?.items ?? []).find(
      (item) =>
        item.href?.startsWith('/finder/') &&
        !item.href.includes('/processing') &&
        item.status === 'completed' &&
        (item.type === 'topic' || item.type === 'brand_intel'),
    );

    test.skip(!completed, 'No completed topic search in history — skip pipeline UI assertion');

    await page.goto(completed!.href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    expect(page.url()).not.toMatch(/\/admin\/login(\?|$)/);
    await expect(page.getByText('Ideation pipeline')).toBeVisible({ timeout: 30_000 });
  });

  test('strategy lab loads', async ({ page }) => {
    await page.goto('/lab', { waitUntil: 'domcontentloaded' });
    expect(page.url()).not.toMatch(/\/admin\/login(\?|$)/);
    await expect(page.locator('body')).toBeVisible();
  });
});
