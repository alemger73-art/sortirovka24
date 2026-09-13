import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', testMatch: ['locale-theme.spec.ts', 'localized-admin.spec.ts', 'localized-cabinet.spec.ts', 'localized-partner.spec.ts'], timeout: 30000, workers: 2,
  reporter: 'list', use: {baseURL:'http://127.0.0.1:3188',channel:'chrome'},
  projects: [
    {name:'mobile',use:{viewport:{width:390,height:844}}},
    {name:'tablet',use:{viewport:{width:768,height:1024}}},
    {name:'desktop',use:{viewport:{width:1440,height:1000}}},
  ],
  webServer:{command:'node node_modules/vite/bin/vite.js preview --config vite.food-test.config.ts --host 127.0.0.1 --port 3188 --strictPort',url:'http://127.0.0.1:3188',reuseExistingServer:false,timeout:120000},
});
