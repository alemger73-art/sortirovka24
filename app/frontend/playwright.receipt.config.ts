import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./e2e',testMatch:'receipt-58.spec.ts',workers:1,reporter:'list',timeout:30000,
  use:{baseURL:'http://127.0.0.1:3195',channel:'chrome',serviceWorkers:'block'},
  webServer:{command:'node node_modules/vite/bin/vite.js build --config vite.receipt-test.config.ts && node node_modules/vite/bin/vite.js preview --config vite.receipt-test.config.ts --host 127.0.0.1 --port 3195 --strictPort',url:'http://127.0.0.1:3195',reuseExistingServer:false}});
