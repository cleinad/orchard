const { defineConfig, devices } = require('@playwright/test');

const PORT = 3005;
const HOST = '127.0.0.1';
const BASE_URL = `http://${HOST}:${PORT}`;

module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: BASE_URL,
    headless: true,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
  webServer: {
    command: `npm run dev -- --hostname ${HOST} --port ${PORT}`,
    url: `${BASE_URL}/home`,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      ...process.env,
      KEEN_E2E_BYPASS_AUTH: '1',
      NEXT_DIST_DIR: process.env.NEXT_DIST_DIR || '.next-e2e',
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'e2e-anon-key',
    },
  },
});
