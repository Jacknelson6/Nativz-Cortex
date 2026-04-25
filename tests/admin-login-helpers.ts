/**
 * Shared admin login for E2E specs that need a real Supabase session.
 */

import { expect, type Page } from '@playwright/test';

/** Any authenticated admin route (avoids coupling to a single landing path). */
const ADMIN_AFTER_LOGIN = /\/admin\/(?!login)/;

async function readInlineLoginError(page: Page): Promise<string | null> {
  const selectors = [
    'form p.text-sm.text-red-500',
    'form .text-red-500',
    '[role="alert"]',
  ];
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    if (await loc.isVisible().catch(() => false)) {
      const t = (await loc.textContent().catch(() => null))?.trim();
      if (t) return t;
    }
  }
  const invalid = page.getByText(/invalid login credentials/i);
  if (await invalid.isVisible().catch(() => false)) {
    return ((await invalid.textContent()) ?? '').trim() || null;
  }
  return null;
}

export async function signInAsAdmin(page: Page, email: string, password: string): Promise<void> {
  const e = email.trim();
  // /admin/login 307s to /login (unified entry post brand-root migration);
  // navigate straight to /login to skip the redirect.
  await page.goto('/login', { waitUntil: 'load' });
  await page.locator('#email').fill(e);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /^sign in$/i }).click();

  const signingInBtn = page.getByRole('button', { name: /^signing in/i });
  const sawSigningIn = await signingInBtn
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (ADMIN_AFTER_LOGIN.test(page.url())) return;

  if (sawSigningIn) {
    await signingInBtn.waitFor({ state: 'hidden', timeout: 45_000 });
  }
  await page.waitForTimeout(150);

  try {
    await expect(page).toHaveURL(ADMIN_AFTER_LOGIN, { timeout: 5_000 });
    return;
  } catch {
    const errText = await readInlineLoginError(page);
    throw new Error(
      `Admin E2E login did not reach an authenticated admin route (current: ${page.url()}). ` +
        (errText
          ? `Message: ${errText}`
          : 'Verify E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD, .env.local Supabase keys, and that the user exists in that project.'),
    );
  }
}
