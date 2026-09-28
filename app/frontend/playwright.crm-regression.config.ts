import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./e2e',testMatch:['operator-stage1.spec.ts','operator-stage2.spec.ts','operator-ui.spec.ts','courier-workflow.spec.ts','dam-business.spec.ts','dam-pos.spec.ts','cashbox.spec.ts','cabinet-usability.spec.ts'],timeout:45000,workers:1,reporter:'list',outputDir:'test-results-crm-regression',
 use:{baseURL:'http://127.0.0.1:3187',channel:'chrome',serviceWorkers:'block',trace:'retain-on-failure'},
 projects:[390,1440].map(width=>({name:`width-${width}`,use:{viewport:{width,height:900}}})),
 webServer:{command:'node node_modules/vite/bin/vite.js preview --config vite.payment-test.config.ts --host 127.0.0.1 --port 3187 --strictPort',url:'http://127.0.0.1:3187',reuseExistingServer:true}});
