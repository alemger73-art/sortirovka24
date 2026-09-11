import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  timeout: 30000, testDir: './e2e', testMatch: ['food-premium.spec.ts', 'food-banners.spec.ts'], workers: 1,
  reporter: 'list', use: { baseURL: 'http://127.0.0.1:3174', channel: 'chrome', screenshot: 'off' },
  projects: [
    { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
  ],
  webServer: { command: 'node node_modules/vite/bin/vite.js preview --config vite.food-test.config.ts --host 127.0.0.1 --port 3174 --strictPort', url: 'http://127.0.0.1:3174', reuseExistingServer: false, timeout: 120000 },
});
