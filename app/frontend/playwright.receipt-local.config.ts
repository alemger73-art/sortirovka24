import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', testMatch: ['customer-order-receipt.spec.ts', 'dam-workflow.spec.ts'], workers: 1,
  outputDir: 'test-results-customer-receipt', reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:3193', channel: 'chrome', serviceWorkers: 'block' },
  webServer: {command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 3193 --strictPort', url: 'http://127.0.0.1:3193', reuseExistingServer: false},
  projects: [
    { name: 'mobile', use: { viewport: { width: 390, height: 844 } } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  ],
});
