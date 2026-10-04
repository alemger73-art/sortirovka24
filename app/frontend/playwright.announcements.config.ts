import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  timeout: 90000, testDir: './e2e', testMatch: 'announcements-flow.spec.ts', workers: 1,
  outputDir: 'test-results-announcements', reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:3012', ...devices['Desktop Chrome'], channel: 'chrome' },
  webServer: { command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 3012 --mode mobile', url: 'http://127.0.0.1:3012', reuseExistingServer: true },
});
