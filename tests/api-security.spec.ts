import { test, expect } from '@playwright/test';

test.describe('API without session', () => {
  test('GET /api/health is public', async ({ request }) => {
    let res = await request.get('/api/health');
    for (let i = 0; i < 5 && !res.ok(); i++) {
      await new Promise((r) => setTimeout(r, 400));
      res = await request.get('/api/health');
    }
    expect(res.ok(), `status ${res.status()}`).toBeTruthy();
    const json = await res.json();
    expect(json).toMatchObject({ status: 'ok' });
  });

  test('GET /api/clients returns 401 JSON', async ({ request }) => {
    const res = await request.get('/api/clients');
    expect(res.status()).toBe(401);
    const json = await res.json().catch(() => ({}));
    expect(json).toMatchObject({ error: 'Unauthorized' });
  });

  // Portal Content Lab endpoints — verify the unauthed boundary. Deeper
  // cross-org scoping is exercised by scripts/qa-topic-plan.ts at the
  // tool-handler level.
  test('GET /api/nerd/searches without session returns 401', async ({ request }) => {
    const res = await request.get('/api/nerd/searches?clientId=00000000-0000-0000-0000-000000000000');
    expect(res.status()).toBe(401);
  });

  test('GET /api/nerd/mentions without session returns 401', async ({ request }) => {
    const res = await request.get('/api/nerd/mentions');
    expect(res.status()).toBe(401);
  });

  test('POST /api/nerd/chat without session returns 401', async ({ request }) => {
    const res = await request.post('/api/nerd/chat', {
      data: { messages: [{ role: 'user', content: 'hi' }], portalMode: true },
    });
    expect(res.status()).toBe(401);
  });

  // Analytics comparative chart endpoint (NAT-33). Admin + viewer can read
  // their own; everyone else → 401/403.
  test('GET /api/analytics/client-series without session returns 401', async ({ request }) => {
    const res = await request.get(
      '/api/analytics/client-series?clientId=00000000-0000-0000-0000-000000000000',
    );
    expect(res.status()).toBe(401);
  });

  // Comptroller token endpoints (NAT-31). Admin-only mint/list/revoke.
  test('GET /api/accounting/periods/[id]/view-tokens without session returns 401', async ({
    request,
  }) => {
    const res = await request.get(
      '/api/accounting/periods/00000000-0000-0000-0000-000000000000/view-tokens',
    );
    expect(res.status()).toBe(401);
  });

  test('POST /api/accounting/periods/[id]/view-tokens without session returns 401', async ({
    request,
  }) => {
    const res = await request.post(
      '/api/accounting/periods/00000000-0000-0000-0000-000000000000/view-tokens',
      { data: { role: 'comptroller' } },
    );
    expect(res.status()).toBe(401);
  });

  // Cron entrypoints — gate behind CRON_SECRET bearer.
  test('GET /api/cron/competitor-snapshots without bearer returns 401', async ({ request }) => {
    const res = await request.get('/api/cron/competitor-snapshots');
    expect(res.status()).toBe(401);
  });

  test('GET /api/cron/check-velocity without bearer returns 401', async ({ request }) => {
    const res = await request.get('/api/cron/check-velocity');
    expect(res.status()).toBe(401);
  });
});

test.describe('Public surfaces', () => {
  // Comptroller read-only payroll view (NAT-31). Unknown token → 404; the
  // page itself doesn't gate behind a session so the check is the token
  // lookup, not auth middleware.
  test('GET /comptroller/[token] with invalid token returns 404', async ({ request }) => {
    const res = await request.get('/comptroller/definitely-not-a-real-token-xyz', {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(404);
  });
});
