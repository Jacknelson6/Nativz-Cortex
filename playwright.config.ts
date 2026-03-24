import { defineConfig, devices } from '@playwright/test';

/**
 * E2E: Playwright spawns `next dev` on PLAYWRIGHT_PORT (default 3100) to avoid clashing with a
 * separate app on :3000 and to skip `npm run predev` (Supabase migrate).
 *
 * Optional: `PLAYWRIGHT_SKIP_WEBSERVER=1` + `PLAYWRIGHT_BASE_URL=http://localhost:3000`
 * Signed-in crawl: `E2E_ADMIN_EMAIL=… E2E_ADMIN_PASSWORD=… npm run test:e2e`
 *
 * @see https://playwright.dev/docs/test-configuration
 */
const e2ePort = process.env.PLAYWRIGHT_PORT ?? '3100';
const spawnedOrigin = `http://127.0.0.1:${e2ePort}`;

const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ??
  (process.env.PLAYWRIGHT_SKIP_WEBSERVER ? 'http://localhost:3000' : spawnedOrigin);

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  globalTimeout: 30 * 60 * 1000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 3 : 6,
  reporter: process.env.CI ? 'github' : 'html',
  timeout: 60_000,
  use: {
    baseURL,
    trace: 'on-first-retry',
    viewport: { width: 1366, height: 768 },
  },

  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        // `next dev` only — avoids `predev` → supabase migrate when DB is unreachable (CI/sandbox).
        // Full local stack with migrate on each dev start: PLAYWRIGHT_WEBSERVER_COMMAND="npm run dev"
        command:
          process.env.PLAYWRIGHT_WEBSERVER_COMMAND ??
          `npx next dev -p ${e2ePort}`,
        url: `${spawnedOrigin}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },

  // NB: only chromium will run in Docker (arm64).
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
