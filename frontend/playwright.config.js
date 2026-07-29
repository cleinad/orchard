const { defineConfig, devices } = require('@playwright/test');

const PORT = Number(process.env.PLAYWRIGHT_PORT || 3005);
const HOST = process.env.PLAYWRIGHT_HOST || '127.0.0.1';
const BASE_URL = `http://${HOST}:${PORT}`;
const SUPABASE_AUTH_PORT = Number(process.env.PLAYWRIGHT_SUPABASE_AUTH_PORT || 54329);
const SUPABASE_AUTH_FIXTURE_URL = `http://${HOST}:${SUPABASE_AUTH_PORT}`;
const AUTH_STORAGE_STATE = process.env.PLAYWRIGHT_AUTH_STORAGE_STATE;
const EXTERNAL_WEB_SERVER = Boolean(process.env.PLAYWRIGHT_NO_WEB_SERVER);
const CONFIGURED_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CONFIGURED_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const USE_SUPABASE_AUTH_FIXTURE = !EXTERNAL_WEB_SERVER && !AUTH_STORAGE_STATE;
const CHROMIUM_EXECUTABLE_PATH = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

if (EXTERNAL_WEB_SERVER && !AUTH_STORAGE_STATE) {
  throw new Error(
    'PLAYWRIGHT_NO_WEB_SERVER requires PLAYWRIGHT_AUTH_STORAGE_STATE '
      + 'with an authenticated browser session.'
  );
}

if (
  !EXTERNAL_WEB_SERVER
  && Boolean(CONFIGURED_SUPABASE_URL) !== Boolean(AUTH_STORAGE_STATE)
) {
  throw new Error(
    'Custom NEXT_PUBLIC_SUPABASE_URL runs require PLAYWRIGHT_AUTH_STORAGE_STATE; '
      + 'unset both variables to use the local E2E Auth fixture.'
  );
}

if (!EXTERNAL_WEB_SERVER && CONFIGURED_SUPABASE_URL && !CONFIGURED_SUPABASE_ANON_KEY) {
  throw new Error(
    'Custom NEXT_PUBLIC_SUPABASE_URL runs also require NEXT_PUBLIC_SUPABASE_ANON_KEY.'
  );
}

module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: BASE_URL,
    headless: true,
    trace: 'retain-on-failure',
    ...(AUTH_STORAGE_STATE ? { storageState: AUTH_STORAGE_STATE } : {}),
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(CHROMIUM_EXECUTABLE_PATH
          ? { launchOptions: { executablePath: CHROMIUM_EXECUTABLE_PATH } }
          : {}),
      },
    },
  ],
  webServer: EXTERNAL_WEB_SERVER
    ? undefined
    : [
      ...(USE_SUPABASE_AUTH_FIXTURE
        ? [{
          command: 'node e2e/helpers/supabaseAuthFixture.js',
          url: `${SUPABASE_AUTH_FIXTURE_URL}/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 120000,
          env: {
            ...process.env,
            PLAYWRIGHT_HOST: HOST,
            PLAYWRIGHT_SUPABASE_AUTH_PORT: String(SUPABASE_AUTH_PORT),
          },
        }]
        : []),
      {
        command: `npm run dev -- --hostname ${HOST} --port ${PORT}`,
        url: `${BASE_URL}/home?e2e=playwright-ready`,
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
        env: {
          ...process.env,
          KEEN_E2E_BYPASS_AUTH: '1',
          NEXT_DIST_DIR: process.env.NEXT_DIST_DIR || `.next-playwright-${PORT}`,
          NEXT_TS_CONFIG_PATH: process.env.NEXT_TS_CONFIG_PATH || 'tsconfig.playwright.json',
          NEXT_PUBLIC_SUPABASE_URL:
            CONFIGURED_SUPABASE_URL || SUPABASE_AUTH_FIXTURE_URL,
          NEXT_PUBLIC_SUPABASE_ANON_KEY:
            CONFIGURED_SUPABASE_ANON_KEY || 'e2e-anon-key',
        },
      },
    ],
});
