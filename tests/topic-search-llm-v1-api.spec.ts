import { test, expect } from '@playwright/test';

/**
 * US-012: lightweight API smoke for llm_v1 routes (no auth).
 * Full end-to-end with TOPIC_SEARCH_PIPELINE=llm_v1 requires admin login (LLM-only by default; add Brave with TOPIC_SEARCH_WEB_RESEARCH=brave) — run manually or set
 * E2E_TOPIC_SEARCH_LLM_V1=1 with PLAYWRIGHT_SKIP_WEBSERVER + seeded env (see tasks/prd-topic-search-llm-pipeline.md).
 */

const fakeId = '00000000-0000-0000-0000-000000000001';

test.describe('LLM topic search routes (auth required)', () => {
  test('POST /api/search/[id]/plan-subtopics returns 401 without session', async ({ request }) => {
    const res = await request.post(`/api/search/${fakeId}/plan-subtopics`);
    expect(res.status()).toBe(401);
    const json = await res.json().catch(() => ({}));
    expect(json).toMatchObject({ error: 'Unauthorized' });
  });

  test('PATCH /api/search/[id]/subtopics returns 401 without session', async ({ request }) => {
    const res = await request.patch(`/api/search/${fakeId}/subtopics`, {
      data: { subtopics: ['One topic'] },
    });
    expect(res.status()).toBe(401);
  });
});
