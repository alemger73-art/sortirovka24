import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', testMatch: 'cabinet-usability.spec.ts', timeout: 30000, workers: 1,
  reporter: 'list', use: { baseURL: 'http://127.0.0.1:3174', channel: 'chrome' },
  projects: [
    { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
  ],
  webServer: { command: `node node_modules/vite/bin/vite.js preview --config vite.food-test.config.ts --outDir "${process.env.CABINET_BUILD_DIR || 'dist'}" --host 127.0.0.1 --port 3174 --strictPort`, url: 'http://127.0.0.1:3174', reuseExistingServer: false, timeout: 120000 },
});
