import { test, expect } from '@playwright/test';
import { signInAsAdmin } from './admin-login-helpers';

/**
 * E2E: admin "New proposal" flow.
 *
 * Walks login → /admin/proposals/new → pick template → fill signer → click
 * "Generate & send" → assert redirect to the detail page.
 *
 * Network is stubbed at the Cortex layer:
 *   - GET /api/admin/proposal-templates → fake list with one AC template
 *   - POST /api/admin/proposals/generate → fake success (no GitHub side effects)
 *
 * Cortex routes + Playwright ARIA checks are real. The stubs keep the test
 * DB-clean (no rows created, no GitHub PRs opened) so it's safe to run on
 * every push.
 *
 *   E2E_ADMIN_EMAIL=… E2E_ADMIN_PASSWORD=… npm run test:e2e -- proposals-generate
 */

const email = process.env.E2E_ADMIN_EMAIL ?? '';
const password = process.env.E2E_ADMIN_PASSWORD ?? '';
const hasCreds = email.length > 0 && password.length > 0;

const FAKE_TEMPLATE_ID = '11111111-2222-3333-4444-555555555555';
const FAKE_SLUG = 'content-editing-packages-test-signer-abc123';

test.describe('Admin proposals — template picker + generate', () => {
  test.skip(!hasCreds, 'Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD');
  test.describe.configure({ mode: 'serial', timeout: 3 * 60 * 1000 });

  test('login → /admin/proposals/new → generate flow', async ({ page }) => {
    await page.context().clearCookies();
    await signInAsAdmin(page, email, password);

    // Stub the templates API before navigating. Returns the AC content-editing
    // template exactly as the real seed row shapes it.
    await page.route('**/api/admin/proposal-templates', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          templates: [
            {
              id: FAKE_TEMPLATE_ID,
              agency: 'anderson',
              name: 'Content Editing Packages',
              description:
                'Monthly retainers for edited social video + Cortex intelligence.',
              source_repo: 'Anderson-Collaborative/ac-docs',
              source_folder: 'content-editing-packages',
              public_base_url: 'https://docs.andersoncollaborative.com',
              tiers_preview: [
                { id: 'essentials', name: 'Essentials', monthly_cents: 150000, cadence: 'month' },
                { id: 'studio', name: 'Studio', monthly_cents: 250000, cadence: 'month' },
                { id: 'full-social', name: 'Full Social', monthly_cents: 445000, cadence: 'month' },
              ],
              active: true,
            },
          ],
        }),
      });
    });

    // Capture the generate POST body so we can assert the UI sent what we expect.
    let lastGenerateBody: Record<string, unknown> | null = null;
    await page.route('**/api/admin/proposals/generate', async (route) => {
      const requestBody = route.request().postDataJSON();
      lastGenerateBody = requestBody as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          proposal_id: '99999999-aaaa-bbbb-cccc-dddddddddddd',
          slug: FAKE_SLUG,
          url: `https://docs.andersoncollaborative.com/${FAKE_SLUG}/`,
          repo: 'Anderson-Collaborative/ac-docs',
          folder: FAKE_SLUG,
          sent: true,
        }),
      });
    });

    // Stub the detail page's server-side proposal lookup so Playwright doesn't
    // 404 when we navigate to the fake slug after generate.
    await page.route(`**/admin/proposals/${FAKE_SLUG}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: `<html><body><h1 data-testid="detail-title">Content Editing Packages — Test</h1></body></html>`,
      });
    });

    await page.goto('/admin/proposals/new', { waitUntil: 'domcontentloaded' });

    // Template card renders with the stubbed name + tiers
    const templateCard = page.getByTestId(`template-card-${FAKE_TEMPLATE_ID}`);
    await expect(templateCard).toBeVisible({ timeout: 10_000 });
    await expect(templateCard).toContainText('Content Editing Packages');
    await expect(templateCard).toContainText('Essentials');
    await expect(templateCard).toContainText('Studio');
    await expect(templateCard).toContainText('Full Social');

    // Single template auto-selects, but click to be explicit (also exercises the
    // click handler for styling).
    await templateCard.click();

    // Fill signer
    await page.locator('input[name="signer_name"]').fill('Test Signer');
    await page.locator('input[name="signer_email"]').fill('test-signer@example.com');

    // Submit
    const submit = page.getByTestId('generate-submit');
    await expect(submit).toBeEnabled();
    await submit.click();

    // Wait for the redirect. We stubbed the destination so the navigation
    // resolves even without a real proposal row.
    await page.waitForURL(new RegExp(`/admin/proposals/${FAKE_SLUG}$`), { timeout: 15_000 });

    // Validate what the form POSTed.
    expect(lastGenerateBody).not.toBeNull();
    const body = lastGenerateBody ?? {};
    expect(body).toMatchObject({
      template_id: FAKE_TEMPLATE_ID,
      signer_name: 'Test Signer',
      signer_email: 'test-signer@example.com',
      send_email: true,
    });
  });
});
