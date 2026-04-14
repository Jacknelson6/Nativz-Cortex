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
});
