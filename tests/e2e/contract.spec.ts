import { test, expect } from '@playwright/test';
import path from 'node:path';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;
const CLIENT_SLUG = process.env.E2E_CLIENT_SLUG;

test.describe('Contract workspace', () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD || !CLIENT_SLUG,
    'Set E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_CLIENT_SLUG to run.',
  );

  test('upload, review, save, delete', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(ADMIN_EMAIL!);
    await page.getByLabel(/password/i).fill(ADMIN_PASSWORD!);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/admin/);

    await page.goto(`/admin/clients/${CLIENT_SLUG}/contract`);
    await expect(page.getByRole('heading', { name: 'Contract' })).toBeVisible();

    await page.getByRole('button', { name: /upload contract/i }).click();
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(__dirname, 'fixtures/sample-contract.txt'));

    await expect(page.getByText(/deliverables/i).first()).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: /^save$/i }).click();

    await expect(page.getByText(/active services/i)).toBeVisible();
    await expect(page.getByText(/Editing/)).toBeVisible();

    page.on('dialog', (d) => d.accept());
    await page.getByLabel('Delete').first().click();
    await expect(page.getByText(/no active services/i)).toBeVisible({ timeout: 10_000 });
  });
});
