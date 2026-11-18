import { defineConfig, devices } from '@playwright/test';

const webBaseUrl = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3000';
const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:4000';
const externalTarget = Boolean(process.env.WEB_BASE_URL || process.env.API_BASE_URL);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: webBaseUrl,
    trace: 'retain-on-failure',
  },
  ...(!externalTarget && {
    webServer: [
      {
        command: 'pnpm --filter @cafeteria/web dev',
        url: webBaseUrl,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
      {
        command: 'pnpm --filter @cafeteria/api dev',
        url: `${apiBaseUrl}/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
    ],
  }),
});
