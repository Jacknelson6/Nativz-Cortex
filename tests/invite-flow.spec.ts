/**
 * Invite Flow — End-to-End Tests
 *
 * Covers all 17 scenarios for:
 *   POST   /api/invites              (admin-only)
 *   GET    /api/invites/validate     (public)
 *   POST   /api/invites/accept       (public)
 *   UI     /portal/join/:token
 */

import { test, expect, request as playwrightRequest } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadEnvConfig } from '@next/env';
import * as fs from 'fs';
import * as path from 'path';

// ── Env + helpers ────────────────────────────────────────────────────────────

loadEnvConfig(process.cwd());

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getTestData(): {
  organizationId: string;
  clientId: string;
  clientName: string;
  adminEmail: string;
  adminPassword: string;
  adminUserId: string;
} {
  const p = path.join(__dirname, '.auth', 'test-data.json');
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

/** Insert an invite token directly via admin client and return its token string. */
async function createInvite(
  options: { usedAt?: string; expiresAt?: string } = {},
): Promise<string> {
  const { clientId, organizationId, adminUserId } = getTestData();
  const db = adminClient();

  const insertPayload: Record<string, unknown> = {
    client_id: clientId,
    organization_id: organizationId,
    created_by: adminUserId,
  };
  if (options.expiresAt) insertPayload.expires_at = options.expiresAt;

  const { data, error } = await db
    .from('invite_tokens')
    .insert(insertPayload)
    .select('token')
    .single();

  if (error) throw new Error(`createInvite failed: ${error.message}`);

  if (options.usedAt) {
    await db
      .from('invite_tokens')
      .update({ used_at: options.usedAt, used_by: adminUserId })
      .eq('token', data.token);
  }

  return data.token as string;
}

/** Delete an invite token by token string. */
async function deleteInvite(token: string) {
  await adminClient().from('invite_tokens').delete().eq('token', token);
}

/** Delete a portal user created during accept tests. */
async function deletePortalUser(email: string) {
  const db = adminClient();
  const { data } = await db.from('users').select('id').eq('email', email).single();
  if (data?.id) {
    await db.auth.admin.deleteUser(data.id);
    // users row is deleted by cascade or already deleted by the route's cleanup
  }
}

// ── Authenticated describe: tests that call admin-only POST /api/invites ─────

test.describe('POST /api/invites — authenticated', () => {
  test.use({ storageState: 'tests/.auth/admin.json' });

  test('1. valid client_id returns token + invite_url + expires_at + client_name', async ({
    request,
  }) => {
    const { clientId, clientName } = getTestData();

    const res = await request.post(`${BASE_URL}/api/invites`, {
      data: { client_id: clientId },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body).toHaveProperty('token');
    expect(typeof body.token).toBe('string');
    expect(body.token.length).toBeGreaterThan(0);

    expect(body).toHaveProperty('invite_url');
    expect(body.invite_url).toContain('/portal/join/');
    expect(body.invite_url).toContain(body.token);

    expect(body).toHaveProperty('expires_at');
    expect(new Date(body.expires_at).getTime()).toBeGreaterThan(Date.now());

    expect(body.client_name).toBe(clientName);

    // Cleanup
    await deleteInvite(body.token);
  });

  test('13. missing client_id returns 400', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/invites`, {
      data: {},
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });
});

// ── Unauthenticated: POST /api/invites without session ───────────────────────

test('14. POST /api/invites without auth returns 401', async () => {
  const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL });
  const res = await ctx.post(`${BASE_URL}/api/invites`, {
    data: { client_id: 'some-id' },
  });

  expect(res.status()).toBe(401);
  const body = await res.json();
  expect(body).toHaveProperty('error');
  await ctx.dispose();
});

// ── GET /api/invites/validate ─────────────────────────────────────────────────

test.describe('GET /api/invites/validate', () => {
  test('2. valid token returns { valid: true, client_name }', async ({ request }) => {
    const { clientName } = getTestData();
    const token = await createInvite();

    const res = await request.get(`${BASE_URL}/api/invites/validate?token=${token}`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.valid).toBe(true);
    expect(body.client_name).toBe(clientName);

    await deleteInvite(token);
  });

  test('5. used token returns 400 with reason: used', async ({ request }) => {
    const token = await createInvite({ usedAt: new Date().toISOString() });

    const res = await request.get(`${BASE_URL}/api/invites/validate?token=${token}`);
    expect(res.status()).toBe(400);

    const body = await res.json();
    expect(body.reason).toBe('used');

    await deleteInvite(token);
  });

  test('6. nonexistent token returns 404', async ({ request }) => {
    const res = await request.get(
      `${BASE_URL}/api/invites/validate?token=nonexistent-token-abc123xyz`,
    );
    expect(res.status()).toBe(404);
  });

  test('7. empty token (no param) returns 400', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/invites/validate`);
    expect(res.status()).toBe(400);
  });

  test('expired token returns 400 with reason: expired', async ({ request }) => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 1 day ago
    const token = await createInvite({ expiresAt: pastDate });

    const res = await request.get(`${BASE_URL}/api/invites/validate?token=${token}`);
    expect(res.status()).toBe(400);

    const body = await res.json();
    expect(body.reason).toBe('expired');

    await deleteInvite(token);
  });
});

// ── POST /api/invites/accept ──────────────────────────────────────────────────

test.describe('POST /api/invites/accept', () => {
  test('4. valid data returns { success: true }', async ({ request }) => {
    const token = await createInvite();
    const email = `portal-user-${Date.now()}@test.nativz.io`;

    const res = await request.post(`${BASE_URL}/api/invites/accept`, {
      data: {
        token,
        full_name: 'Test Portal User',
        email,
        password: 'testpassword123',
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Cleanup
    await deletePortalUser(email);
  });

  test('8. missing required fields returns 400', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/invites/accept`, {
      data: { token: 'some-token', full_name: 'Test User' }, // missing email + password
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  test('9. password shorter than 8 chars returns 400', async ({ request }) => {
    const token = await createInvite();

    const res = await request.post(`${BASE_URL}/api/invites/accept`, {
      data: {
        token,
        full_name: 'Test User',
        email: `short-pw-${Date.now()}@test.nativz.io`,
        password: 'abc1234', // 7 chars
      },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/8/); // "at least 8 characters"

    await deleteInvite(token);
  });

  test('10. nonexistent token returns 404', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/invites/accept`, {
      data: {
        token: 'nonexistent-token-abc123xyz',
        full_name: 'Test User',
        email: `no-token-${Date.now()}@test.nativz.io`,
        password: 'testpassword123',
      },
    });

    expect(res.status()).toBe(404);
  });

  test('11. already-used token returns 400', async ({ request }) => {
    const token = await createInvite({ usedAt: new Date().toISOString() });

    const res = await request.post(`${BASE_URL}/api/invites/accept`, {
      data: {
        token,
        full_name: 'Test User',
        email: `used-token-${Date.now()}@test.nativz.io`,
        password: 'testpassword123',
      },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error');

    await deleteInvite(token);
  });

  test('12. duplicate email returns 409', async ({ request }) => {
    const { adminEmail } = getTestData();
    const token = await createInvite();

    const res = await request.post(`${BASE_URL}/api/invites/accept`, {
      data: {
        token,
        full_name: 'Duplicate User',
        email: adminEmail, // already registered
        password: 'testpassword123',
      },
    });

    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body).toHaveProperty('error');

    await deleteInvite(token);
  });
});

// ── UI tests ─────────────────────────────────────────────────────────────────

test.describe('UI /portal/join/:token', () => {
  test('3. valid token: fill form and submit → success state', async ({ page }) => {
    const token = await createInvite();
    const email = `ui-accept-${Date.now()}@test.nativz.io`;

    await page.goto(`${BASE_URL}/portal/join/${token}`);

    // Wait for valid state (form becomes visible)
    await expect(page.getByText('Create your account')).toBeVisible({ timeout: 10000 });

    await page.fill('#full_name', 'UI Test User');
    await page.fill('#email', email);
    await page.fill('#password', 'testpassword123');
    await page.click('button[type="submit"]');

    // Wait for success state
    await expect(page.getByText('Account created')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Your portal account is ready')).toBeVisible();

    // Cleanup
    await deletePortalUser(email);
  });

  test('15. invalid token → shows invalid state', async ({ page }) => {
    await page.goto(`${BASE_URL}/portal/join/invalid-token-xyz-totally-fake`);

    await expect(page.getByText('Invalid invite')).toBeVisible({ timeout: 10000 });
    // "Go to login" button should be present
    await expect(page.getByRole('link', { name: /go to login/i })).toBeVisible();
  });

  test('16. expired token → shows expired state', async ({ page }) => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const token = await createInvite({ expiresAt: pastDate });

    await page.goto(`${BASE_URL}/portal/join/${token}`);

    await expect(page.getByText('Invite expired')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/expired.*ask your account manager/i)).toBeVisible();

    await deleteInvite(token);
  });

  test('17. used token → shows used state', async ({ page }) => {
    const token = await createInvite({ usedAt: new Date().toISOString() });

    await page.goto(`${BASE_URL}/portal/join/${token}`);

    await expect(page.getByText('Invite already used')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/already been used/i)).toBeVisible();

    await deleteInvite(token);
  });
});
