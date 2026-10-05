import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'checkout-mobile.spec.ts',
  forbidOnly: !!process.env.CI,
  workers: 1,
  retries: 0,
  timeout: 45000,
  reporter: 'list',
  outputDir: '../../work/checkout-playwright',
  use: {
    baseURL: 'http://127.0.0.1:3187',
    serviceWorkers: 'block',
    actionTimeout: 10000,
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath: process.env.S24_CHROMIUM_PATH,
      args: ['--disable-background-networking', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'],
    },
  },
  projects: [320, 360, 390].flatMap(width => ['light', 'dark'].map(colorScheme => ({
    name: `${width}-${colorScheme}`,
    use: { viewport: { width, height: 480 }, colorScheme: colorScheme as 'light' | 'dark' },
  }))),
  webServer: [
    {
      command: 'python -m tests.payment_browser_server',
      cwd: '../backend',
      url: 'http://127.0.0.1:3188/__test__/sessions',
      reuseExistingServer: false,
      env: { ENVIRONMENT: 'test', DATABASE_URL: 'sqlite+aiosqlite:///:memory:', EXTERNAL_SIDE_EFFECTS: 'disabled', INTEGRITY_BASE_URL: '', JWT_SECRET_KEY: 'checkout-local-synthetic-only' },
      timeout: 120000,
    },
    {
      command: 'node node_modules/vite/bin/vite.js preview --config vite.payment-test.config.ts --port 3187 --strictPort',
      url: 'http://127.0.0.1:3187',
      reuseExistingServer: false,
    },
  ],
});
