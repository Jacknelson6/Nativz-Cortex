import { test, expect } from '@playwright/test';
import { ADMIN_E2E_FULL_STATIC_ROUTES } from './route-matrix';
import { fetchJson, filterCriticalConsoleErrors } from './e2e-helpers';
import { signInAsAdmin } from './admin-login-helpers';

const email = process.env.E2E_ADMIN_EMAIL ?? '';
const password = process.env.E2E_ADMIN_PASSWORD ?? '';
const hasCreds = email.length > 0 && password.length > 0;

type ClientRow = { id: string; slug: string; name?: string };
type HistoryResponse = { items: { href: string }[] };
type PresentationRow = { id: string };

/**
 * Sign in as admin, then walk **static** admin routes + **dynamic** shells discovered via API
 * (first client slug, first search / ideas from history, first presentation).
 *
 *   E2E_ADMIN_EMAIL=… E2E_ADMIN_PASSWORD=… npm run test:e2e
 *
 * Skipped when env vars are unset (CI without secrets stays green).
 */
test.describe('Admin full journey', () => {
  test.skip(!hasCreds, 'Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD');

  test.describe.configure({ mode: 'serial', timeout: 15 * 60 * 1000 });

  test('login → static routes → API-linked dynamic pages', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.context().clearCookies();
    await signInAsAdmin(page, email, password);

    const visited = new Set<string>();

    async function visitPath(path: string) {
      if (visited.has(path)) return;
      visited.add(path);
      const attempts = 3;
      for (let i = 0; i < attempts; i++) {
        try {
          await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 60_000 });
          break;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const flaky =
            msg.includes('ERR_ABORTED') ||
            msg.includes('ERR_CONNECTION_RESET') ||
            msg.includes('Target page, context or browser has been closed');
          if (flaky && i < attempts - 1) {
            await page.waitForTimeout(600);
            continue;
          }
          throw e;
        }
      }
      expect(page.url(), `still on login after ${path}`).not.toMatch(/\/admin\/login(\?|$)/);
      await expect(page.locator('body')).toBeVisible();
    }

    const staticRoutes = [...new Set(ADMIN_E2E_FULL_STATIC_ROUTES)];
    for (const path of staticRoutes) {
      await visitPath(path);
    }

    // One Nerd API docs subsection (large catalog; spot-check a common section).
    await visitPath('/admin/nerd/api/auth');

    const clients = await fetchJson<ClientRow[]>(page.request, '/api/clients');
    const firstClient = clients?.[0];
    if (firstClient?.slug) {
      const slug = firstClient.slug;
      const clientNested = [
        `/admin/clients/${slug}`,
        `/admin/clients/${slug}/settings`,
        `/admin/clients/${slug}/brand-dna`,
        `/admin/clients/${slug}/knowledge`,
        `/admin/clients/${slug}/ideas`,
        `/admin/clients/${slug}/ideas/generate`,
        `/admin/clients/${slug}/ad-creatives`,
        `/admin/clients/${slug}/moodboard`,
      ];
      for (const p of clientNested) {
        await visitPath(p);
      }
    }

    const history = await fetchJson<HistoryResponse>(
      page.request,
      '/api/research/history?limit=30',
    );
    const historyItems = (history?.items ?? []).filter((item) => {
      const href = item.href;
      return href?.startsWith('/admin/') && !href.includes('/processing');
    });
    for (const item of historyItems.slice(0, 15)) {
      await visitPath(item.href);
    }

    const presentations = await fetchJson<PresentationRow[]>(page.request, '/api/presentations');
    const firstPres = presentations?.[0];
    if (firstPres?.id) {
      await visitPath(`/admin/presentations/${firstPres.id}`);
      await visitPath(`/admin/presentations/${firstPres.id}/present`);
    }

    const bad = filterCriticalConsoleErrors(errors);
    expect(bad, `Console errors:\n${bad.join('\n')}`).toEqual([]);
  });
});
