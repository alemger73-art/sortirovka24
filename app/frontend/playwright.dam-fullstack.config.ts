import { defineConfig } from '@playwright/test';

// Real backend + disposable database: the customer orders, the operator works the order,
// the customer sees every status. Run: npm run build:mobile && npx playwright test -c playwright.dam-fullstack.config.ts
export default defineConfig({
  testDir: './e2e',
  testMatch: ['dam-fullstack.spec.ts', 'food-cart.spec.ts', 'dam-client-ux.spec.ts', 'food-checkout.spec.ts', 'cabinet.spec.ts'],
  workers: 1,
  retries: 0,
  timeout: 90000,
  reporter: 'list',
  outputDir: process.env.S24_E2E_OUT || 'test-results/dam-fullstack',
  use: {
    baseURL: 'http://127.0.0.1:3197',
    serviceWorkers: 'block',
    actionTimeout: 15000,
    viewport: { width: 390, height: 844 },
    launchOptions: { executablePath: process.env.S24_CHROMIUM_PATH },
  },
  webServer: [
    {
      command: `${process.env.S24_PYTHON || 'python'} -m tests.dam_fullstack_server`,
      cwd: '../backend',
      url: 'http://127.0.0.1:3198/__test__/sessions',
      reuseExistingServer: false,
      env: { ENVIRONMENT: 'test', DATABASE_URL: 'sqlite+aiosqlite:///:memory:', EXTERNAL_SIDE_EFFECTS: 'disabled', INTEGRITY_BASE_URL: '', JWT_SECRET_KEY: 'dam-fullstack-local-only' },
      timeout: 120000,
    },
    {
      command: 'node node_modules/vite/bin/vite.js preview --config vite.dam-fullstack.config.ts --port 3197 --strictPort',
      url: 'http://127.0.0.1:3197',
      reuseExistingServer: false,
    },
  ],
});
