import { defineConfig, devices } from '@playwright/test';

/**
 * E2E: `npm run dev` (or rely on webServer below), then `npm run test:e2e`
 * Optional signed-in crawl: `E2E_ADMIN_EMAIL=… E2E_ADMIN_PASSWORD=… npm run test:e2e`
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  globalTimeout: 30 * 60 * 1000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 3 : 6,
  reporter: process.env.CI ? 'github' : 'html',
  timeout: 60_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    viewport: { width: 1366, height: 768 },
  },

  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: 'npm run dev',
        url: `${process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'}/api/health`,
        reuseExistingServer: true,
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
